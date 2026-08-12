import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";
import { SubscriptionService } from "./subscription.service";

@ApiTags("Subscriptions — Customer")
@Controller({ path: "subscription", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscription: SubscriptionService) {}

  @Get("current")
  async current(@CurrentOrganization() organizationId: string) {
    return this.subscription.getCurrent(organizationId);
  }
}
