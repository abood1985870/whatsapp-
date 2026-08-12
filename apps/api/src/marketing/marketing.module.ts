import { Module } from "@nestjs/common";
import { WhatsAppModule } from "../whatsapp/whatsapp.module";
import { AuditModule } from "../audit/audit.module";
import { MarketingController } from "./marketing.controller";
import { MarketingEntitlementsService } from "./entitlements.service";
import { MarketingGuard } from "./guards/marketing.guard";
import { MarketingSettingsService } from "./settings/marketing-settings.service";
import { ProductsController } from "./products/products.controller";
import { ProductsService } from "./products/products.service";
import { DncController } from "./dnc/dnc.controller";
import { DncService } from "./dnc/dnc.service";
import { StrandedRecipientReaperService } from "./campaigns/stranded-recipient-reaper.service";
import { LeadsController } from "./leads/leads.controller";
import { LeadsService } from "./leads/leads.service";
import { LeadImportService } from "./leads/lead-import.service";
import { MockDiscoveryProvider } from "./discovery/mock-discovery.provider";
import { GooglePlacesDiscoveryProvider } from "./discovery/google-places.provider";
import { SafeWebsiteFetcher } from "./website/safe-website-fetcher";
import { WebsiteIntelligenceService } from "./website/website-intelligence.service";
import { CampaignsController } from "./campaigns/campaigns.controller";
import { CampaignsService } from "./campaigns/campaigns.service";
import { CampaignDispatchService } from "./campaigns/campaign-dispatch.service";
import { MarketingSendService } from "./campaigns/marketing-send.service";
import { DiscountService } from "./sales/discount.service";
import { HotLeadService } from "./sales/hot-lead.service";
import { SalesConversationService } from "./sales/sales-conversation.service";
import { MarketingAnalyticsController } from "./analytics/marketing-analytics.controller";
import { MarketingAnalyticsService } from "./analytics/marketing-analytics.service";

@Module({
  imports: [WhatsAppModule, AuditModule],
  controllers: [
    MarketingController,
    ProductsController,
    DncController,
    LeadsController,
    CampaignsController,
    MarketingAnalyticsController,
  ],
  providers: [
    MarketingEntitlementsService,
    MarketingGuard,
    MarketingSettingsService,
    ProductsService,
    DncService,
    StrandedRecipientReaperService,
    LeadsService,
    LeadImportService,
    MockDiscoveryProvider,
    GooglePlacesDiscoveryProvider,
    SafeWebsiteFetcher,
    WebsiteIntelligenceService,
    CampaignsService,
    CampaignDispatchService,
    MarketingSendService,
    DiscountService,
    HotLeadService,
    SalesConversationService,
    MarketingAnalyticsService,
  ],
  exports: [
    SalesConversationService,
    MarketingEntitlementsService,
    CampaignDispatchService,
    // Reused by the Voice module so the voice channel shares one sales engine.
    DiscountService,
    LeadsService,
    HotLeadService,
    // Exported so opt-out detection can run on EVERY inbound message, not only
    // messages that happen to belong to a sales conversation.
    DncService,
  ],
})
export class MarketingModule {}
