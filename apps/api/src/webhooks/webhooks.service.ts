import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { queues, emitToOrganization } from "@qanoai/queue";
import { EvolutionProvider } from "../whatsapp/providers/evolution.provider";
import { normalizePhone, generateCorrelationId } from "@qanoai/shared";
import {
  findPendingEscalationForSupportPhone,
  claimPendingSupportEscalation,
  learnFromSupportReply,
  markPendingSupportEscalation,
  processAgentTurn,
  checkConversationTurnLimit
} from "@qanoai/ai";
import { SalesConversationService } from "../marketing/sales/sales-conversation.service";
import { DncService } from "../marketing/dnc/dnc.service";
import { OutboundGuardService } from "../whatsapp/outbound-guard.service";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  constructor(
    private readonly evolutionProvider: EvolutionProvider,
    private readonly salesConversation: SalesConversationService,
    private readonly dnc: DncService,
    private readonly outboundGuard: OutboundGuardService
  ) {}
  
  async processEvolutionWebhook(payload: any, headers: any, query?: any): Promise<any> {
    // Signature is verified FIRST and unconditionally. There is deliberately no
    // per-event-type fallback here: a `messages.update` branch used to run even
    // when the signature check had already failed, which meant one event type
    // bypassed authentication entirely and wrote across every tenant.
    if (!this.evolutionProvider.hasValidSignature(payload, headers, query)) {
      this.logger.warn("Rejected Evolution webhook with invalid or missing signature");
      return { received: false };
    }

    const event = await this.evolutionProvider.validateWebhook(payload, headers, query);
    if (!event) {
      // Signature already verified above, so this is a shape we do not parse into
      // a message event. Status updates are the one such shape we still act on.
      if (payload?.event === "messages.update" && payload?.data?.key?.id) {
        await this.handleMessageUpdate(payload.data, payload?.instance);
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

    // Guard marketing campaigns when WhatsApp drops: pause any RUNNING
    // campaign on this connection so we never lose progress or blindly
    // retry. Normal support behavior is unaffected. Resume is explicit.
    if (["DISCONNECTED", "LOGGED_OUT", "ERROR"].includes(state.status)) {
      try {
        await prisma.campaign.updateMany({
          where: { organizationId: connection.organizationId, channelConnectionId: connection.id, status: "RUNNING" },
          data: { status: "PAUSED", pausedAt: new Date() },
        });
      } catch (error: any) {
        this.logger.warn(`Failed to pause campaigns on disconnect: ${error?.message}`);
      }
    }

    this.safeEmitToOrganization(connection.organizationId, "whatsapp:connection", {
      id: connection.id,
      status: state.status,
      phoneNumber: state.phoneNumber,
    });
  }
  
  private async handleIncomingMessage(connection: any, event: any): Promise<any> {
    if (await this.handleSupportReply(connection, event)) return;

    const normalizedPhone = normalizePhone(event.phoneNumber);
    let contact = await prisma.contact.findUnique({ where: { organizationId_normalizedPhone: { organizationId: connection.organizationId, normalizedPhone } } });
    if (!contact) { 
      contact = await prisma.contact.create({ data: { organizationId: connection.organizationId, primaryPhone: event.phoneNumber, normalizedPhone, name: event.pushName, source: "WHATSAPP", firstSeenAt: new Date() } }); 
    } else if (!contact.name && event.pushName) {
      contact = await prisma.contact.update({ where: { id: contact.id }, data: { name: event.pushName } });
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

    // Opt-out, for EVERY conversation.
    //
    // This ran only inside the sales path, which requires a salesContext on the
    // conversation. A customer in an ordinary support thread who wrote
    // "أوقفوا الرسائل" was never recorded as having opted out, so the next
    // campaign messaged them anyway — and the person had done exactly what we
    // asked them to do to make it stop.
    if (this.dnc.detectOptOutIntent(event.message.text)) {
      await this.dnc
        .addNormalized(connection.organizationId, contact.primaryPhone, "customer opt-out", null, "OPT_OUT")
        .catch((e: any) => this.logger.warn(`Could not record opt-out: ${e?.message}`));
      await prisma.contact.updateMany({
        where: { id: contact.id, organizationId: connection.organizationId },
        data: { consentStatus: "OPTED_OUT", marketingOptOutAt: new Date() },
      });
      this.logger.log(`Recorded opt-out for contact ${contact.id}`);
    }

    const contactPayload = { name: contact.name, primaryPhone: contact.primaryPhone, avatarUrl: contact.avatarUrl };
    this.safeEmitToOrganization(connection.organizationId, isNewConversation ? "conversation:new" : "conversation:updated", {
      id: conversation.id,
      contact: contactPayload,
      status: conversation.status,
      mode: conversation.mode,
      priority: conversation.priority,
      lastMessageAt: conversation.lastMessageAt,
      assignedMembership: null
    });
    this.safeEmitToOrganization(connection.organizationId, "message:new", {
      id: message.id,
      conversationId: conversation.id,
      text: message.text,
      direction: message.direction,
      senderType: message.senderType,
      createdAt: message.createdAt,
      providerStatus: message.providerStatus,
      isAiGenerated: message.isAiGenerated
    });

    // Marketing sales branch: if this conversation was created by a campaign
    // (carries salesContext), the AI Sales Agent handles it instead of the
    // support agent. Fail-open — any error falls through to normal support.
    if ((conversation.metadata as any)?.salesContext) {
      try {
        const handledBySales = await this.salesConversation.handleInbound({
          organizationId: connection.organizationId,
          conversation,
          contact,
          connection,
          messageText: event.message.text,
          inboundMessageId: message.id,
        });
        if (handledBySales) return;
      } catch (error: any) {
        this.logger.error(`Sales branch failed, falling back to support: ${error?.message}`);
      }
    }

    if (!["HUMAN_ONLY", "PAUSED"].includes(conversation.mode)) {
      const agent = await prisma.aiAgent.findFirst({ where: { organizationId: connection.organizationId, status: "ACTIVE" } });
      if (agent) {
        try {
          await queues.aiResponse.add("process-ai-response", {
            organizationId: connection.organizationId,
            conversationId: conversation.id,
            agentId: agent.id,
            messageId: message.id,
            content: event.message.text,
          }, {
            delay: 5000,
          });
        } catch (error: any) {
          this.logger.warn(`AI queue unavailable; processing inline for conversation ${conversation.id}: ${error.message}`);
          await this.processAiInline({
            organizationId: connection.organizationId,
            conversationId: conversation.id,
            agentId: agent.id,
            messageId: message.id,
            content: event.message.text
          });
        }
      } else {
        this.logger.warn(`No active AI agent for organization ${connection.organizationId}, skipping auto-reply`);
      }
    }
  }

  private async processAiInline(input: {
    organizationId: string;
    conversationId: string;
    agentId: string;
    messageId: string;
    content: string;
  }): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      include: { contact: true, connection: true }
    });
    if (!conversation) return;

    const latestInbound = await prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: "INBOUND",
        senderType: "CUSTOMER",
        deletedAt: null
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (latestInbound && latestInbound.id !== input.messageId) {
      this.logger.log(`Skipping stale inline AI response for conversation ${input.conversationId}`);
      return;
    }

    // Per-conversation ceiling, checked BEFORE the model is called.
    //
    // The existing action limit counted AiRun rows, but rows were only written
    // for REPLY and HANDOFF — every other decision spent a model call and left
    // no trace. So the exact runaway the cap exists to stop (two automated
    // systems answering each other, each turn ending in a decision that writes
    // nothing) could never reach it.
    if (!(await checkConversationTurnLimit(input.conversationId))) {
      this.logger.warn(
        `Conversation ${input.conversationId} hit the AI turn limit - handing to a human instead of replying`
      );
      await prisma.conversation.updateMany({
        where: { id: input.conversationId, organizationId: input.organizationId },
        data: { status: "WAITING_FOR_AGENT", handoffReason: "AI_TURN_LIMIT_REACHED" }
      });
      await this.recordAiRun({
        organizationId: input.organizationId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        decision: "TURN_LIMIT",
        content: input.content,
        latencyMs: 0,
        errorMessage: "AI_TURN_LIMIT_REACHED"
      });
      return;
    }

    const startedAt = Date.now();
    const response = await processAgentTurn({
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      agentId: input.agentId,
      message: input.content
    });
    const latencyMs = Date.now() - startedAt;

    if (response.decision === "REPLY" && response.replyMessage) {
      const aiMessage = await this.createAndSendAiMessage({
        organizationId: input.organizationId,
        conversation,
        text: response.replyMessage
      });

      await prisma.aiRun.create({
        data: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          status: "COMPLETED",
          decision: response.decision,
          confidence: response.confidence,
          input: input.content,
          output: response.replyMessage,
          citations: response.citations,
          tokenUsage: response.tokenUsage !== undefined ? { total: response.tokenUsage } : undefined,
          costUsd: response.costUsd,
          latencyMs,
          completedAt: new Date()
        }
      });

      this.safeEmitToOrganization(input.organizationId, "message:new", this.messagePayload(aiMessage));
      return;
    }

    if (response.decision === "HANDOFF") {
      const agent = await prisma.aiAgent.findUnique({ where: { id: input.agentId } });
      const handoffText = agent?.handoffMessage || agent?.fallbackMessage || "تم تحويلك إلى الدعم الفني.";

      const updated = await prisma.conversation.update({
        where: { id: input.conversationId },
        data: {
          status: "WAITING_FOR_AGENT",
          handoffReason: response.reason || "AI triggered handoff"
        },
        include: { contact: true, connection: true }
      });

      const handoffMessage = await this.createAndSendAiMessage({
        organizationId: input.organizationId,
        conversation: updated,
        text: handoffText
      });

      await prisma.aiRun.create({
        data: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          status: "COMPLETED",
          decision: response.decision,
          confidence: response.confidence,
          input: input.content,
          errorMessage: response.reason,
          citations: response.citations,
          tokenUsage: response.tokenUsage !== undefined ? { total: response.tokenUsage } : undefined,
          costUsd: response.costUsd,
          latencyMs,
          completedAt: new Date()
        }
      });

      await markPendingSupportEscalation({
        conversationId: input.conversationId,
        agentId: input.agentId,
        question: input.content,
        lastCustomerMessageId: input.messageId,
        supportPhoneNumber: agent?.supportPhoneNumber
      });

      if (agent?.supportPhoneNumber && updated.connection.providerInstanceId) {
        // The alert no longer carries the customer's number or their question.
        //
        // supportPhoneNumber is a free-text field an admin types; nothing
        // verifies that the person holding it works here, and a typo sends a
        // stranger a named customer's phone number and whatever they just
        // asked — which may be an order number, an address, or a complaint.
        // The link requires a login, so the details stay behind authentication
        // where they belong.
        const alertGate = await this.outboundGuard.check({
          organizationId: input.organizationId,
          toPhone: agent.supportPhoneNumber,
          kind: "SYSTEM_NOTICE",
        });

        if (alertGate.allowed) {
          await this.evolutionProvider
            .sendText({
              instanceId: updated.connection.providerInstanceId,
              phoneNumber: agent.supportPhoneNumber,
              text: [
                "تنبيه: محادثة تنتظر ردّك",
                "فيه عميل يحتاج موظف بشري.",
                `افتح المحادثة: ${process.env.APP_URL || "https://qanoai-whatsappsupport.vercel.app"}/app/inbox/${input.conversationId}`,
              ].join("\n"),
            })
            .catch((e: any) => this.logger.warn(`Support alert failed: ${e?.message}`));
        } else {
          this.logger.warn(`Support alert blocked: ${alertGate.reason}`);
        }
      }

      this.safeEmitToOrganization(input.organizationId, "conversation:updated", {
        id: updated.id,
        contact: { name: updated.contact.name, primaryPhone: updated.contact.primaryPhone, avatarUrl: updated.contact.avatarUrl },
        status: updated.status,
        mode: updated.mode,
        priority: updated.priority,
        lastMessageAt: updated.lastMessageAt
      });
      this.safeEmitToOrganization(input.organizationId, "message:new", this.messagePayload(handoffMessage));
      return;
    }

    // Any other decision still consumed a model call. Recording it is what makes
    // the turn cap and the per-organization cost total mean anything.
    await this.recordAiRun({
      organizationId: input.organizationId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      decision: response.decision,
      content: input.content,
      latencyMs,
      confidence: response.confidence,
      errorMessage: response.reason,
      tokenUsage: response.tokenUsage,
      costUsd: response.costUsd
    });
  }

  /** One place that writes an AiRun row, so no decision path can forget to. */
  private async recordAiRun(input: {
    organizationId: string;
    agentId: string;
    conversationId: string;
    decision: string;
    content: string;
    latencyMs: number;
    confidence?: number;
    errorMessage?: string;
    tokenUsage?: number;
    costUsd?: number;
  }): Promise<void> {
    await prisma.aiRun
      .create({
        data: {
          organizationId: input.organizationId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          status: "COMPLETED",
          decision: input.decision,
          confidence: input.confidence ?? 0,
          input: input.content?.slice(0, 4000),
          errorMessage: input.errorMessage,
          tokenUsage: input.tokenUsage !== undefined ? { total: input.tokenUsage } : undefined,
          costUsd: input.costUsd,
          latencyMs: input.latencyMs,
          completedAt: new Date()
        }
      })
      .catch((e: any) => this.logger.warn(`Could not record AI run: ${e?.message}`));
  }

  private async createAndSendAiMessage(input: { organizationId: string; conversation: any; text: string }) {
    const message = await prisma.message.create({
      data: {
        organizationId: input.organizationId,
        conversationId: input.conversation.id,
        channelConnectionId: input.conversation.channelConnectionId,
        contactId: input.conversation.contactId,
        direction: "OUTBOUND",
        senderType: "AI_AGENT",
        messageType: "TEXT",
        text: input.text,
        providerStatus: "PENDING",
        isAiGenerated: true
      }
    });

    try {
      const result = await this.evolutionProvider.sendText({
        instanceId: input.conversation.connection.providerInstanceId,
        phoneNumber: input.conversation.contact.normalizedPhone,
        text: input.text
      });
      return prisma.message.update({
        where: { id: message.id },
        data: {
          providerStatus: "SENT",
          providerMessageId: result.messageId,
          sentAt: new Date(),
          failedAt: null,
          providerErrorMessage: null
        }
      });
    } catch (error: any) {
      this.logger.error(`Inline AI WhatsApp send failed: ${error.message}`);
      return prisma.message.update({
        where: { id: message.id },
        data: {
          providerStatus: "FAILED",
          providerErrorMessage: error.message,
          failedAt: new Date()
        }
      });
    }
  }

  private messagePayload(message: any) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      text: message.text,
      direction: message.direction,
      senderType: message.senderType,
      createdAt: message.createdAt,
      providerStatus: message.providerStatus,
      isAiGenerated: message.isAiGenerated
    };
  }

  private async handleSupportReply(connection: any, event: any): Promise<boolean> {
    const supportConversation = await findPendingEscalationForSupportPhone({
      organizationId: connection.organizationId,
      supportPhoneNumber: event.phoneNumber
    });
    if (!supportConversation) return false;

    const answer = String(event.message?.text || "").trim();
    if (!answer) return true;

    // Claim the escalation BEFORE forwarding. If it has already been answered,
    // this message is just the support person using their own phone normally —
    // it must not be relayed to the customer. Claiming first also means a
    // failure below cannot leave the escalation open for the next message to
    // pick up.
    const claimed = await claimPendingSupportEscalation(supportConversation.id);
    if (!claimed) return false;

    let providerStatus = "PENDING";
    let providerMessageId: string | undefined;
    try {
      const result = await this.evolutionProvider.sendText({
        instanceId: supportConversation.connection.providerInstanceId,
        phoneNumber: supportConversation.contact.normalizedPhone,
        text: answer
      });
      providerStatus = "SENT";
      providerMessageId = result.messageId;
    } catch (error: any) {
      providerStatus = "FAILED";
      this.logger.error(`Failed to forward support reply: ${error.message}`);
    }

    const message = await prisma.message.create({
      data: {
        organizationId: supportConversation.organizationId,
        conversationId: supportConversation.id,
        channelConnectionId: supportConversation.channelConnectionId,
        contactId: supportConversation.contactId,
        providerMessageId,
        direction: "OUTBOUND",
        senderType: "HUMAN",
        messageType: "TEXT",
        text: answer,
        providerStatus,
        providerErrorMessage: providerStatus === "FAILED" ? "Failed to forward support WhatsApp reply" : undefined,
        sentAt: providerStatus === "SENT" ? new Date() : undefined
      }
    });

    await learnFromSupportReply({
      conversationId: supportConversation.id,
      answer,
      sourceMessageId: message.id,
      source: "WHATSAPP_SUPPORT_REPLY",
      pending: claimed
    });

    const updated = await prisma.conversation.update({
      where: { id: supportConversation.id },
      data: { lastMessageAt: new Date(), status: "WAITING_FOR_CUSTOMER" }
    });

    this.safeEmitToOrganization(supportConversation.organizationId, "conversation:updated", {
      id: updated.id,
      contact: {
        name: supportConversation.contact.name,
        primaryPhone: supportConversation.contact.primaryPhone,
        avatarUrl: supportConversation.contact.avatarUrl
      },
      status: updated.status,
      mode: updated.mode,
      priority: updated.priority,
      lastMessageAt: updated.lastMessageAt
    });
    this.safeEmitToOrganization(supportConversation.organizationId, "message:new", {
      id: message.id,
      conversationId: message.conversationId,
      text: message.text,
      direction: message.direction,
      senderType: message.senderType,
      createdAt: message.createdAt,
      providerStatus: message.providerStatus,
      isAiGenerated: message.isAiGenerated
    });

    this.logger.log(`Forwarded and learned support reply for conversation ${supportConversation.id}`);
    return true;
  }

  private async handleMessageUpdate(data: any, instanceId?: string): Promise<any> {
    // Example Evolution API payload structure for message status updates
    const messageId = data?.key?.id;
    const update = data?.update;
    let status = "SENT";

    if (update?.status === 3) status = "DELIVERED";
    if (update?.status === 4) status = "READ";
    if (update?.error) status = "FAILED";

    // Resolve the owning organization from the instance the event arrived on, so
    // a status update can never rewrite rows belonging to another tenant that
    // happens to share a provider message id.
    const connection = instanceId
      ? await prisma.channelConnection.findFirst({
          where: { providerInstanceId: instanceId, deletedAt: null },
          select: { organizationId: true },
        })
      : null;
    if (!connection) {
      this.logger.warn(`Ignoring message status update for unknown instance: ${String(instanceId).slice(0, 64)}`);
      return { received: true, processed: false };
    }
    const organizationId = connection.organizationId;

    if (messageId) {
      const matches = await prisma.message.findMany({ where: { providerMessageId: messageId, organizationId }, select: { id: true, organizationId: true } });
      if (matches.length) {
        await prisma.message.updateMany({
          where: { providerMessageId: messageId, organizationId },
          data: {
            providerStatus: status,
            providerErrorMessage: update?.error ? String(update.error).slice(0, 500) : null
          }
        });
        for (const m of matches) {
          this.safeEmitToOrganization(m.organizationId, "message:status", { messageId: m.id, status });
        }
      }
      this.logger.log(`Updated message ${messageId} status to ${status}`);
    }
  }

  private safeEmitToOrganization(organizationId: string, event: string, data: any): void {
    try {
      emitToOrganization(organizationId, event, data);
    } catch (error: any) {
      this.logger.warn(`Realtime emit skipped for ${event}: ${error.message}`);
    }
  }
}
