import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { queues, emitToOrganization } from "@qanoai/queue";
import { EvolutionProvider } from "../whatsapp/providers/evolution.provider";
import { normalizePhone, generateCorrelationId } from "@qanoai/shared";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(private readonly evolutionProvider: EvolutionProvider) {}
  
  async processEvolutionWebhook(payload: any, headers: any, query?: any): Promise<any> {
    const event = await this.evolutionProvider.validateWebhook(payload, headers, query);
    if (!event) { 
      // It might be a status update that validateWebhook doesn't parse fully, 
      // but let's try to extract status update from raw payload
      if (payload?.event === "messages.update" && payload?.data?.key?.id) {
        await this.handleMessageUpdate(payload.data);
        return { received: true, processed: true };
      }
      this.logger.warn("Invalid webhook payload"); 
      return { received: false }; 
    }
    
    const connection = await prisma.channelConnection.findFirst({ where: { providerInstanceId: event.instanceId, deletedAt: null } });
    if (!connection) { this.logger.warn(`Connection not found for instance: ${event.instanceId}`); return { received: false }; }
    
    const idempotencyKey = `${event.instanceId}:${event.message?.id || event.eventType}:${event.message?.timestamp || Date.now()}`;
    const existing = await prisma.webhookEvent.findUnique({ where: { idempotencyKey } });
    if (existing) { this.logger.log(`Duplicate webhook ignored: ${idempotencyKey}`); return { received: true, duplicate: true }; }
    
    await prisma.webhookEvent.create({ 
      data: { 
        organizationId: connection.organizationId, 
        channelConnectionId: connection.id, 
        provider: "EVOLUTION", 
        providerEventId: event.message?.id, 
        eventType: event.eventType, 
        idempotencyKey, 
        sanitizedPayload: payload, 
        payloadHash: generateCorrelationId(), 
        processingStatus: "RECEIVED" 
      } 
    });
    
    if (event.eventType === "CONNECTION_UPDATE" && event.connectionState) {
      await this.handleConnectionUpdate(connection, event.connectionState);
    }

    if ((event.eventType === "messages.upsert" || event.eventType === "MESSAGES_UPSERT") && event.message?.text) { 
      await this.handleIncomingMessage(connection, event); 
    }
    return { received: true, processed: true };
  }

  private async handleConnectionUpdate(connection: any, state: any): Promise<void> {
    const data: any = { status: state.status };
    if (state.status === "CONNECTED") {
      data.lastConnectedAt = new Date();
      if (state.phoneNumber) data.phoneNumber = state.phoneNumber;
    }
    if (state.status === "DISCONNECTED") data.lastDisconnectedAt = new Date();

    await prisma.channelConnection.update({ where: { id: connection.id }, data });
    emitToOrganization(connection.organizationId, "whatsapp:connection", {
      id: connection.id,
      status: state.status,
      phoneNumber: state.phoneNumber,
    });
  }
  
  private async handleIncomingMessage(connection: any, event: any): Promise<any> {
    const normalizedPhone = normalizePhone(event.phoneNumber);
    let contact = await prisma.contact.findUnique({ where: { organizationId_normalizedPhone: { organizationId: connection.organizationId, normalizedPhone } } });
    if (!contact) { 
      contact = await prisma.contact.create({ data: { organizationId: connection.organizationId, primaryPhone: event.phoneNumber, normalizedPhone, source: "WHATSAPP", firstSeenAt: new Date() } }); 
    }
    await prisma.contact.update({ where: { id: contact.id }, data: { lastSeenAt: new Date() } });

    let conversation = await prisma.conversation.findFirst({ where: { organizationId: connection.organizationId, contactId: contact.id, status: { notIn: ["RESOLVED", "CLOSED", "SPAM", "BLOCKED"] } } });
    const isNewConversation = !conversation;
    if (!conversation) {
      conversation = await prisma.conversation.create({ data: { organizationId: connection.organizationId, channelConnectionId: connection.id, contactId: contact.id, status: "NEW", mode: "AI_AUTOMATIC" } });
    }

    const message = await prisma.message.create({
      data: {
        organizationId: connection.organizationId,
        conversationId: conversation.id,
        channelConnectionId: connection.id,
        contactId: contact.id,
        providerMessageId: event.message.id,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        messageType: "TEXT",
        text: event.message.text,
        receivedAt: new Date(event.message.timestamp * 1000)
      }
    });
    conversation = await prisma.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), status: "OPEN" } });
    this.logger.log(`Processed incoming message from ${event.phoneNumber} in conversation ${conversation.id}`);

    const contactPayload = { name: contact.name, primaryPhone: contact.primaryPhone, avatarUrl: contact.avatarUrl };
    emitToOrganization(connection.organizationId, isNewConversation ? "conversation:new" : "conversation:updated", {
      id: conversation.id,
      contact: contactPayload,
      status: conversation.status,
      mode: conversation.mode,
      priority: conversation.priority,
      lastMessageAt: conversation.lastMessageAt,
      assignedMembership: null
    });
    emitToOrganization(connection.organizationId, "message:new", {
      id: message.id,
      conversationId: conversation.id,
      text: message.text,
      direction: message.direction,
      senderType: message.senderType,
      createdAt: message.createdAt,
      providerStatus: message.providerStatus,
      isAiGenerated: message.isAiGenerated
    });

    if (conversation.mode === "AI_AUTOMATIC") {
      const agent = await prisma.aiAgent.findFirst({ where: { organizationId: connection.organizationId, status: "ACTIVE" } });
      if (agent) {
        await queues.aiResponse.add("process-ai-response", {
          organizationId: connection.organizationId,
          conversationId: conversation.id,
          agentId: agent.id,
          messageId: message.id,
          content: event.message.text,
        });
      } else {
        this.logger.warn(`No active AI agent for organization ${connection.organizationId}, skipping auto-reply`);
      }
    }
  }

  private async handleMessageUpdate(data: any): Promise<any> {
    // Example Evolution API payload structure for message status updates
    const messageId = data?.key?.id;
    const update = data?.update;
    let status = "SENT";
    
    if (update?.status === 3) status = "DELIVERED";
    if (update?.status === 4) status = "READ";
    if (update?.error) status = "FAILED";

    if (messageId) {
      const matches = await prisma.message.findMany({ where: { providerMessageId: messageId }, select: { id: true, organizationId: true } });
      if (matches.length) {
        await prisma.message.updateMany({
          where: { providerMessageId: messageId },
          data: { providerStatus: status, providerErrorMessage: update?.error || null }
        });
        for (const m of matches) {
          emitToOrganization(m.organizationId, "message:status", { messageId: m.id, status });
        }
      }
      this.logger.log(`Updated message ${messageId} status to ${status}`);
    }
  }
}
