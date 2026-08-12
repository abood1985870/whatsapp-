import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PlatformOwnerGuard } from "./guards/platform-owner.guard";
import { PricingService } from "./pricing.service";

/** Owner-only, end to end — cost inputs and computed margins never reach a customer-facing route. */
@ApiTags("Subscriptions — Pricing")
@Controller({ path: "pricing", version: "1" })
@UseGuards(AuthGuard, PlatformOwnerGuard)
@ApiBearerAuth()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Get("cost-config")
  async getCostConfig() {
    return this.pricing.getCostConfig();
  }

  @Patch("cost-config")
  async updateCostConfig(@Body() dto: any, @CurrentUser("id") userId: string) {
    return this.pricing.updateCostConfig(dto, userId);
  }

  @Get("margin-report")
  async marginReport() {
    return this.pricing.marginReport();
  }
}
