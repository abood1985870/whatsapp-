import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { EvolutionProvider } from "../../whatsapp/providers/evolution.provider";
import { MarketingSettingsService } from "../settings/marketing-settings.service";
import { formatSarMinor } from "./discount.service";
import { OutboundGuardService } from "../../whatsapp/outbound-guard.service";

/**
 * Sends the owner a single WhatsApp alert per hot lead (deduped by
 * lead+campaign). Failure to notify never blocks the conversation.
 */
@Injectable()
export class HotLeadService {
  private readonly logger = new Logger(HotLeadService.name);

  constructor(private readonly outboundGuard: OutboundGuardService, 
    private readonly evolutionProvider: EvolutionProvider,
    private readonly settings: MarketingSettingsService
  ) {}

  async notifyIfNeeded(input: {
    organizationId: string;
    leadId: string;
    campaignId?: string | null;
    conversationId?: string | null;
    productName: string;
    priceMinor: number;
    businessName: string;
    businessType?: string | null;
    lastMessage: string;
    appBaseUrl?: string;
  }): Promise<boolean> {
    const dedupKey = `${input.organizationId}:${input.leadId}:${input.campaignId ?? "none"}`;
    const existing = await prisma.hotLeadAlert.findUnique({ where: { dedupKey } });
    if (existing) return false;

    const settings = await this.settings.getOrCreate(input.organizationId);
    if (!settings.ownerHotLeadPhone) return false;

    const connection = await prisma.channelConnection.findFirst({
      where: { organizationId: input.organizationId, deletedAt: null, status: "CONNECTED" },
      orderBy: { lastConnectedAt: "desc" },
    });

    // Record the alert first (dedup) even if the send fails, so we never spam.
    await prisma.hotLeadAlert.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.leadId,
        campaignId: input.campaignId ?? null,
        conversationId: input.conversationId ?? null,
        dedupKey,
        status: connection?.providerInstanceId ? "SENT" : "PENDING",
      },
    });

    if (!connection?.providerInstanceId) return false;

    const link = input.conversationId && input.appBaseUrl ? `${input.appBaseUrl}/app/inbox/${input.conversationId}` : "";
    const text = [
      "🔥 فرصة بيع ساخنة",
      "",
      `العميل: ${input.businessName}`,
      input.businessType ? `النشاط: ${input.businessType}` : "",
      `البرنامج: ${input.productName}`,
      `السعر: ${formatSarMinor(input.priceMinor)}`,
      `آخر رسالة: ${input.lastMessage.slice(0, 200)}`,
      link ? `\nفتح المحادثة:\n${link}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await this.evolutionProvider.sendText({
        instanceId: connection.providerInstanceId,
        phoneNumber: settings.ownerHotLeadPhone,
        text,
      });
      return true;
    } catch (error: any) {
      this.logger.warn(`Hot lead alert send failed: ${error?.message}`);
      return false;
    }
  }
}
