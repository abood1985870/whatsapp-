import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../common/guards/auth.guard";
import { PlatformOwnerGuard } from "./guards/platform-owner.guard";
import { PlansService } from "./plans.service";

@ApiTags("Subscriptions — Plans")
@Controller({ path: "plans", version: "1" })
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  /** Public — the landing page pricing section reads this before the visitor has an account. */
  @Get()
  async listPublic() {
    return this.plans.listPublic();
  }

  @Get("all")
  @UseGuards(AuthGuard, PlatformOwnerGuard)
  @ApiBearerAuth()
  async listAll() {
    return this.plans.listAll();
  }

  @Post()
  @UseGuards(AuthGuard, PlatformOwnerGuard)
  @ApiBearerAuth()
  async create(@Body() dto: any) {
    return this.plans.create(dto);
  }

  @Patch(":id")
  @UseGuards(AuthGuard, PlatformOwnerGuard)
  @ApiBearerAuth()
  async update(@Param("id") id: string, @Body() dto: any) {
    return this.plans.update(id, dto);
  }
}
