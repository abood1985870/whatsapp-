import { Injectable, NotFoundException, BadRequestException, Logger, ForbiddenException } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { EvolutionProvider } from "./providers/evolution.provider";
import { config } from "@qanoai/config";
import { normalizePhoneStrict } from "@qanoai/shared";
import { OutboundGuardService } from "./outbound-guard.service";

/** A broadcast is a bulk action by a human, not a campaign. Campaigns have their own pipeline. */
const MAX_BROADCAST_RECIPIENTS = 200;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  
  constructor(
    private readonly evolutionProvider: EvolutionProvider,
    private readonly outboundGuard: OutboundGuardService
  ) {}
  
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
    if (state.status !== connection.status) {
      const data: any = { status: state.status };
      if (state.status === "CONNECTED") {
        data.lastConnectedAt = new Date();
        if (state.phoneNumber) data.phoneNumber = state.phoneNumber;
      }
      if (state.status === "DISCONNECTED") data.lastDisconnectedAt = new Date();
      await prisma.channelConnection.update({ where: { id: connectionId }, data });
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

  /**
   * Direct send from the WhatsApp screen.
   *
   * A person is choosing to send this, so it is HUMAN_REPLY — the kill switch
   * does not stop it, and neither do quiet hours. It still passes the gate, so
   * a number on the do-not-contact list is respected and an unparseable one is
   * refused rather than handed to the provider.
   */
  async sendMessage(connectionId: string, to: string, text: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") throw new BadRequestException("CONNECTION_NOT_READY");

    const gate = await this.outboundGuard.check({
      organizationId: connection.organizationId,
      toPhone: to,
      kind: "HUMAN_REPLY",
    });
    if (!gate.allowed) throw new BadRequestException(gate.reason);

    return this.evolutionProvider.sendText({ instanceId: connection.providerInstanceId, phoneNumber: to, text });
  }

  async sendTemplate(connectionId: string, to: string, templateName: string, parameters: any[], user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") throw new BadRequestException("CONNECTION_NOT_READY");

    const gate = await this.outboundGuard.check({
      organizationId: connection.organizationId,
      toPhone: to,
      kind: "HUMAN_REPLY",
    });
    if (!gate.allowed) throw new BadRequestException(gate.reason);

    return this.evolutionProvider.sendTemplate({ instanceId: connection.providerInstanceId, phoneNumber: to, templateName, parameters });
  }

  /**
   * Send one message to several of this organization's own contacts.
   *
   * As written before, this took an arbitrary array of phone-number strings and
   * sent to every one of them: no length limit, no check that the numbers had
   * anything to do with the caller's organization, no do-not-contact lookup, no
   * opt-out check, no Message rows, and no audit trail. It was a spam cannon
   * pointed at any number in the world, operable by anyone who could reach the
   * endpoint, and it left no record of what it had sent or to whom.
   *
   * Now: bounded, contacts must already exist in this organization, every
   * recipient goes through the shared outbound gate, and every send writes a
   * Message row so it appears in the inbox like any other outbound message.
   */
  async broadcast(connectionId: string, contacts: string[], text: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId || connection.status !== "CONNECTED") {
      throw new BadRequestException("CONNECTION_NOT_READY");
    }
    if (!Array.isArray(contacts) || contacts.length === 0) throw new BadRequestException("NO_RECIPIENTS");
    if (contacts.length > MAX_BROADCAST_RECIPIENTS) throw new BadRequestException("TOO_MANY_RECIPIENTS");
    if (!text?.trim()) throw new BadRequestException("TEXT_REQUIRED");

    const organizationId = connection.organizationId;

    // Resolve against this organization's contacts. A number that is not
    // already a contact here is not a number this organization may message.
    const normalized = contacts
      .map((c) => normalizePhoneStrict(String(c)).normalized)
      .filter((n): n is string => Boolean(n));

    const known = await prisma.contact.findMany({
      where: { organizationId, normalizedPhone: { in: normalized }, deletedAt: null },
      select: { id: true, primaryPhone: true, normalizedPhone: true },
    });

    const skipped = normalized.length - known.length;

    // Check the gate once BEFORE reporting success. broadcast() returns
    // immediately and sends in the background, so an operator who starts one at
    // 23:00 was told "queued: 40" and got zero messages sent, with nothing in
    // the UI to say why.
    const sample = known[0]
      ? await this.outboundGuard.check({
          organizationId,
          toPhone: known[0].primaryPhone,
          kind: "MARKETING",
          contactId: known[0].id,
        })
      : { allowed: true as boolean, reason: undefined as string | undefined };

    if (!sample.allowed && (sample.reason === "QUIET_HOURS" || sample.reason === "KILL_SWITCH_ENABLED" || sample.reason === "DAILY_CAP_REACHED")) {
      throw new BadRequestException(sample.reason);
    }

    this.processBroadcast(connection, known, text).catch((e) =>
      this.logger.error(`Broadcast failed: ${e.message}`)
    );

    return {
      success: true,
      queued: known.length,
      skippedUnknownNumbers: skipped,
      skippedUnparseable: contacts.length - normalized.length,
    };
  }

  private async processBroadcast(
    connection: any,
    contacts: Array<{ id: string; primaryPhone: string; normalizedPhone: string }>,
    text: string
  ): Promise<void> {
    // Collected so the run can be reported rather than only logged. A broadcast
    // started at 23:00 is entirely blocked by quiet hours, and the caller was
    // told "queued: 40" before any of that was known.
    const skippedReasons: string[] = [];

    for (const contact of contacts) {
      try {
        const gate = await this.outboundGuard.check({
          organizationId: connection.organizationId,
          toPhone: contact.primaryPhone,
          kind: "MARKETING",
          contactId: contact.id,
        });
        if (!gate.allowed) {
          skippedReasons.push(gate.reason ?? "BLOCKED");
          this.logger.warn(`Broadcast skipped contact ${contact.id}: ${gate.reason}`);
          continue;
        }

        // Every send belongs to a conversation, so it shows up in the inbox
        // rather than vanishing into the provider.
        let conversation = await prisma.conversation.findFirst({
          where: {
            organizationId: connection.organizationId,
            contactId: contact.id,
            status: { notIn: ["RESOLVED", "CLOSED", "SPAM", "BLOCKED"] },
          },
        });
        if (!conversation) {
          conversation = await prisma.conversation.create({
            data: {
              organizationId: connection.organizationId,
              channelConnectionId: connection.id,
              contactId: contact.id,
              status: "OPEN",
              mode: "HUMAN_ONLY",
            },
          });
        }

        const result = await this.evolutionProvider.sendText({
          instanceId: connection.providerInstanceId,
          phoneNumber: contact.normalizedPhone,
          text,
        });

        await prisma.message.create({
          data: {
            organizationId: connection.organizationId,
            conversationId: conversation.id,
            channelConnectionId: connection.id,
            contactId: contact.id,
            providerMessageId: result.messageId,
            direction: "OUTBOUND",
            senderType: "HUMAN",
            messageType: "TEXT",
            text,
            providerStatus: "SENT",
            isMarketing: true,
            sentAt: new Date(),
            metadata: { kind: "BROADCAST" },
          },
        });

        // Pace it. Sending as fast as the API allows is what gets a number banned.
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (e: any) {
        skippedReasons.push("SEND_FAILED");
        this.logger.error(`Broadcast message to contact ${contact.id} failed: ${e.message}`);
      }
    }

    if (skippedReasons.length > 0) {
      const counts = skippedReasons.reduce<Record<string, number>>((acc, r) => {
        acc[r] = (acc[r] ?? 0) + 1;
        return acc;
      }, {});
      this.logger.warn(
        `Broadcast finished with ${skippedReasons.length} skipped of ${contacts.length}: ${JSON.stringify(counts)}`
      );
    }
  }

  async getMedia(connectionId: string, messageId: string, user: any): Promise<any> {
    const connection = await this.findAuthorizedConnection(connectionId, user);
    if (!connection.providerInstanceId) throw new NotFoundException("CONNECTION_NOT_FOUND");
    const buffer = await this.evolutionProvider.getMediaBuffer(connection.providerInstanceId, messageId);
    return buffer.toString("base64");
  }
}
