import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { PlatformService } from "./platform.service";

@ApiTags("Platform")
@Controller({ path: "platform", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("overview")
  async overview(@CurrentUser() user: any) {
    return this.platformService.getOverview(user);
  }

  @Get("organizations")
  async organizations(@CurrentUser() user: any) {
    return this.platformService.listOrganizations(user);
  }

  @Get("subscriptions")
  async subscriptions(@CurrentUser() user: any) {
    return this.platformService.listSubscriptions(user);
  }

  @Post("customers")
  async createCustomer(@CurrentUser() user: any, @Body() dto: any) {
    return this.platformService.createCustomer(user, dto);
  }
}
