import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { EvolutionProvider } from "./providers/evolution.provider";
import { config } from "@qanoai/config";

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  
  constructor(private readonly evolutionProvider: EvolutionProvider) {}
  
  async createConnection(organizationId: string, name: string): Promise<any> {
    const existingIncomplete = await prisma.channelConnection.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        status: { not: "CONNECTED" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existingIncomplete) return existingIncomplete;

    const connection = await prisma.channelConnection.create({ data: { organizationId, name, status: "CREATING" } });
    try {
      const instance = await this.evolutionProvider.createInstance({ name: connection.id, organizationId });

      // Point Evolution's webhook at our API so incoming messages actually
      // reach the system - without this the AI auto-reply chain never fires.
      const webhookUrl = config.EVOLUTION_WEBHOOK_BASE_URL || "http://host.docker.internal:3001/v1/webhooks/evolution";
      try {
        await this.evolutionProvider.setWebhook({ instanceId: instance.instanceId, url: webhookUrl });
      } catch (webhookError: any) {
        this.logger.error(`Webhook auto-configuration failed for ${instance.instanceId}: ${webhookError.message}`);
      }

      await prisma.channelConnection.update({ where: { id: connection.id }, data: { providerInstanceId: instance.instanceId, webhookUrl, status: "QR_REQUIRED" } });
      return { ...connection, providerInstanceId: instance.instanceId, status: "QR_REQUIRED" };
    } catch (error: any) {
      this.logger.error(`Failed to create instance: ${error.message}`);
      await prisma.channelConnection.update({ where: { id: connection.id }, data: { status: "ERROR", providerMetadata: { error: error.message } } });
      throw error;
    }
  }
  
  private async findAuthorizedConnection(connectionId: string, user: any): Promise<any> {
    const connection = await prisma.channelConnection.findFirst({ where: { id: connectionId, deletedAt: null } });
    if (!connection) throw new NotFoundException("CONNECTION_NOT_FOUND");

    const hasAccess = (user?.memberships || []).some(
      (membership: any) => membership.organizationId === connection.organizationId && membership.status === "ACTIVE"
    );
    if (!hasAccess) throw new ForbiddenException("ORGANIZATION_ACCESS_DENIED");

    return connection;
  }

  async getQrCode(connectionId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new BadRequestException("CONNECTION_PROVIDER_INSTANCE_MISSING");
    const qr = await this.evolutionProvider.requestQrCode(connection.providerInstanceId!); 
    return { qrCode: qr.qrCode, expiresAt: qr.expiresAt };
  }
  
  async getStatus(connectionId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) return { status: connection.status };
    
    const state = await this.evolutionProvider.getConnectionState(connection.providerInstanceId); 
    if (state.status === "CONNECTED" && connection.status !== "CONNECTED") { 
      await prisma.channelConnection.update({ where: { id: connectionId }, data: { status: "CONNECTED", lastConnectedAt: new Date(), phoneNumber: state.phoneNumber } }); 
    }
    return { status: state.status, phoneNumber: state.phoneNumber, error: state.error };
  }
  
  async deleteConnection(connectionId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (connection.providerInstanceId) { 
      try { 
        await this.evolutionProvider.disconnect(connection.providerInstanceId); 
        await this.evolutionProvider.deleteInstance(connection.providerInstanceId); 
      } catch (error: any) { 
        this.logger.warn(`Provider cleanup failed: ${error.message}`); 
      } 
    }
    await prisma.channelConnection.update({ where: { id: connectionId }, data: { status: "DISCONNECTED", deletedAt: new Date() } }); 
    return { success: true };
  }
  
  async findByOrganization(organizationId: string): Promise<any> { 
    return prisma.channelConnection.findMany({ where: { organizationId, deletedAt: null }, orderBy: { createdAt: "desc" } }); 
  }

  async reconnect(connectionId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new NotFoundException("CONNECTION_NOT_FOUND");
    await this.evolutionProvider.reconnect(connection.providerInstanceId);
    await prisma.channelConnection.update({ where: { id: connectionId }, data: { status: "CONNECTING" } });
    return { success: true };
  }

  async configureWebhook(connectionId: string, url: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new NotFoundException("CONNECTION_NOT_FOUND");
    await this.evolutionProvider.setWebhook({ instanceId: connection.providerInstanceId, url });
    return { success: true };
  }

  async getHealth(connectionId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new NotFoundException("CONNECTION_NOT_FOUND");
    const state = await this.evolutionProvider.getConnectionState(connection.providerInstanceId);
    return { isHealthy: state.status === "CONNECTED", status: state.status, lastConnectedAt: connection.lastConnectedAt };
  }

  async sendMessage(connectionId: string, to: string, text: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") throw new BadRequestException("CONNECTION_NOT_READY");
    const result = await this.evolutionProvider.sendText({ instanceId: connection.providerInstanceId, phoneNumber: to, text });
    return result;
  }

  async sendTemplate(connectionId: string, to: string, templateName: string, parameters: any[], user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") throw new BadRequestException("CONNECTION_NOT_READY");
    const result = await this.evolutionProvider.sendTemplate({ instanceId: connection.providerInstanceId, phoneNumber: to, templateName, parameters });
    return result;
  }

  async broadcast(connectionId: string, contacts: string[], text: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") throw new BadRequestException("CONNECTION_NOT_READY");
    
    // Process broadcast asynchronously to respect rate limits
    this.processBroadcast(connection.providerInstanceId, contacts, text).catch(e => this.logger.error(`Broadcast failed: ${e.message}`));
    return { success: true, queued: contacts.length };
  }

  private async processBroadcast(instanceId: string, contacts: string[], text: string): Promise<any> {
    for (const contact of contacts) {
      try {
        await this.evolutionProvider.sendText({ instanceId, phoneNumber: contact, text });
        // Rate limiting: wait 2 seconds between messages
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e: any) {
        this.logger.error(`Broadcast message to ${contact} failed: ${e.message}`);
      }
    }
  }

  async getMedia(connectionId: string, messageId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new NotFoundException("CONNECTION_NOT_FOUND");
    const buffer = await this.evolutionProvider.getMediaBuffer(connection.providerInstanceId, messageId);
    return buffer.toString("base64");
  }
}
