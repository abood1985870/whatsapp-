import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { generateCorrelationId } from "@qanoai/shared";
import { emitToOrganization } from "@qanoai/queue";
import { EvolutionProvider } from "../whatsapp/providers/evolution.provider";
import { learnFromSupportReply } from "@qanoai/ai";

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly evolutionProvider: EvolutionProvider) {}

  async findByConversation(conversationId: string, cursor?: string): Promise<any> {
    const where: any = { conversationId, deletedAt: null };
    if (cursor) where.createdAt = { lt: new Date(cursor) };
    return prisma.message.findMany({ 
      where, 
      include: { mediaAsset: true, contact: { select: { id: true, name: true, avatarUrl: true } } }, 
      orderBy: { createdAt: "desc" }, 
      take: 50 
    });
  }

  async searchMessages(organizationId: string, query: string): Promise<any> {
    return prisma.message.findMany({
      where: {
        organizationId,
        deletedAt: null,
        text: { contains: query, mode: "insensitive" }
      },
      include: { contact: { select: { name: true } }, conversation: { select: { id: true, status: true } } },
      orderBy: { createdAt: "desc" },
      take: 20
    });
  }

  async sendMessage(dto: { conversationId: string; text: string; organizationId: string; membershipId: string }): Promise<any> {
    const conversation = await prisma.conversation.findUnique({ where: { id: dto.conversationId }, include: { contact: true, connection: true } });
    if (!conversation || !conversation.channelConnectionId) throw new NotFoundException("CONVERSATION_NOT_FOUND");

    let providerStatus = "PENDING";
    let providerMessageId = undefined;

    const instanceId = conversation.connection.providerInstanceId;
    const phoneNumber = conversation.contact.normalizedPhone;
    if (instanceId && phoneNumber) {
      try {
        const result = await this.evolutionProvider.sendText({
          instanceId,
          phoneNumber,
          text: dto.text
        });
        providerStatus = "SENT";
        providerMessageId = result.messageId;
      } catch (e: any) {
        this.logger.error(`Failed to send message: ${e.message}`);
        providerStatus = "FAILED";
      }
    }

    const message = await prisma.message.create({ 
      data: { 
        organizationId: dto.organizationId, 
        conversationId: dto.conversationId, 
        channelConnectionId: conversation.channelConnectionId, 
        contactId: conversation.contactId,
        direction: "OUTBOUND", 
        senderType: "HUMAN", 
        senderMembershipId: dto.membershipId, 
        messageType: "TEXT", 
        text: dto.text, 
        providerStatus,
        providerMessageId,
        clientIdempotencyKey: generateCorrelationId()
      }
    });
    await learnFromSupportReply({
      conversationId: dto.conversationId,
      answer: dto.text,
      sourceMessageId: message.id,
      source: "INBOX_HUMAN_REPLY"
    });
    await prisma.conversation.update({ where: { id: dto.conversationId }, data: { lastMessageAt: new Date(), status: "WAITING_FOR_CUSTOMER" } });
    emitToOrganization(dto.organizationId, "message:new", {
      id: message.id,
      conversationId: message.conversationId,
      text: message.text,
      direction: message.direction,
      senderType: message.senderType,
      createdAt: message.createdAt,
      providerStatus: message.providerStatus,
      isAiGenerated: message.isAiGenerated
    });
    return message;
  }

  async sendMediaMessage(file: any, dto: { conversationId: string; organizationId: string; membershipId: string; caption?: string }): Promise<any> {
    const conversation = await prisma.conversation.findUnique({ where: { id: dto.conversationId }, include: { contact: true, connection: true } });
    if (!conversation || !conversation.channelConnectionId) throw new NotFoundException("CONVERSATION_NOT_FOUND");

    // Implement media upload to MinIO/S3 placeholder
    const mediaUrl = await this.uploadToS3(file);

    // Create MediaAsset record
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        organizationId: dto.organizationId,
        storageKey: mediaUrl,
        mimeType: file.mimetype || "application/octet-stream",
        sizeBytes: file.size || 0
      }
    });

    let providerStatus = "PENDING";
    let providerMessageId = undefined;

    const instanceId = conversation.connection.providerInstanceId;
    const phoneNumber = conversation.contact.normalizedPhone;
    if (instanceId && phoneNumber) {
      try {
        const result = await this.evolutionProvider.sendMedia({
          instanceId,
          phoneNumber,
          url: mediaUrl,
          caption: dto.caption,
          mediaType: this.toEvolutionMediaType(file.mimetype),
          mimeType: file.mimetype,
          fileName: file.originalname
        });
        providerStatus = "SENT";
        providerMessageId = result.messageId;
      } catch (e: any) {
        this.logger.error(`Failed to send media: ${e.message}`);
        providerStatus = "FAILED";
      }
    }

    const message = await prisma.message.create({
      data: {
        organizationId: dto.organizationId,
        conversationId: dto.conversationId,
        channelConnectionId: conversation.channelConnectionId,
        contactId: conversation.contactId,
        direction: "OUTBOUND",
        senderType: "HUMAN",
        senderMembershipId: dto.membershipId,
        messageType: "IMAGE",
        text: dto.caption,
        mediaAssetId: mediaAsset.id,
        providerStatus,
        providerMessageId,
        clientIdempotencyKey: generateCorrelationId()
      }
    });
    
    await prisma.conversation.update({ where: { id: dto.conversationId }, data: { lastMessageAt: new Date(), status: "WAITING_FOR_CUSTOMER" } });
    return message;
  }

  async sendTemplateMessage(dto: { conversationId: string; templateName: string; parameters: any[]; organizationId: string; membershipId: string }): Promise<any> {
    const conversation = await prisma.conversation.findUnique({ where: { id: dto.conversationId }, include: { contact: true, connection: true } });
    if (!conversation || !conversation.channelConnectionId) throw new NotFoundException("CONVERSATION_NOT_FOUND");

    let providerStatus = "PENDING";
    let providerMessageId = undefined;

    const instanceId = conversation.connection.providerInstanceId;
    const phoneNumber = conversation.contact.normalizedPhone;
    if (instanceId && phoneNumber) {
      try {
        const result = await this.evolutionProvider.sendTemplate({
          instanceId,
          phoneNumber,
          templateName: dto.templateName,
          parameters: dto.parameters
        });
        providerStatus = "SENT";
        providerMessageId = result.messageId;
      } catch (e: any) {
        this.logger.error(`Failed to send template: ${e.message}`);
        providerStatus = "FAILED";
      }
    }

    const message = await prisma.message.create({
      data: {
        organizationId: dto.organizationId,
        conversationId: dto.conversationId,
        channelConnectionId: conversation.channelConnectionId,
        contactId: conversation.contactId,
        direction: "OUTBOUND",
        senderType: "HUMAN",
        senderMembershipId: dto.membershipId,
        messageType: "TEMPLATE",
        text: `[Template: ${dto.templateName}]`,
        providerStatus,
        providerMessageId,
        clientIdempotencyKey: generateCorrelationId()
      }
    });

    await prisma.conversation.update({ where: { id: dto.conversationId }, data: { lastMessageAt: new Date(), status: "WAITING_FOR_CUSTOMER" } });
    return message;
  }

  async retryMessage(id: string): Promise<any> {
    const message = await prisma.message.findUnique({ where: { id }, include: { conversation: { include: { contact: true, connection: true } } } });
    if (!message || message.providerStatus !== "FAILED") throw new BadRequestException("MESSAGE_NOT_FAILED");

    const { conversation } = message;
    const instanceId = conversation.connection.providerInstanceId;
    const phoneNumber = conversation.contact.normalizedPhone;
    if (instanceId && phoneNumber) {
      try {
        const result = await this.evolutionProvider.sendText({
          instanceId,
          phoneNumber,
          text: message.text || ""
        });
        return prisma.message.update({ where: { id }, data: { providerStatus: "SENT", providerMessageId: result.messageId, sentAt: new Date(), failedAt: null, providerErrorMessage: null } });
      } catch (e: any) {
        return prisma.message.update({ where: { id }, data: { providerStatus: "FAILED", providerErrorMessage: e.message, failedAt: new Date() } });
      }
    }
    return message;
  }

  async softDeleteMessage(id: string): Promise<any> {
    return prisma.message.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async addInternalNote(conversationId: string, membershipId: string, content: string): Promise<any> {
    return prisma.internalNote.create({ data: { conversationId, membershipId, content } });
  }

  async updateMessageStatus(providerMessageId: string, status: string): Promise<any> {
    return prisma.message.updateMany({
      where: { providerMessageId },
      data: { providerStatus: status }
    });
  }

  private async uploadToS3(file: any): Promise<string> {
    // Mock MinIO/S3 upload implementation
    this.logger.log(`Mock uploading file to S3: ${file?.originalname || "unknown"}`);
    const uniqueId = generateCorrelationId();
    const ext = file?.originalname?.split('.').pop() || "bin";
    return `http://localhost:9000/qanoai-media/${uniqueId}.${ext}`;
  }

  private toEvolutionMediaType(mimeType?: string): string {
    const type = mimeType?.split("/")[0];
    if (type === "image" || type === "video" || type === "audio") return type;
    return "document";
  }
}
