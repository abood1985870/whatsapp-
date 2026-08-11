import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { prisma } from "@qanoai/database";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { CurrentOrganization } from "../common/decorators/current-organization.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ErasureService } from "./erasure.service";
import { RetentionService } from "./retention.service";

@ApiTags("Privacy")
@Controller({ path: "privacy", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class PrivacyController {
  constructor(
    private readonly erasure: ErasureService,
    private readonly retention: RetentionService
  ) {}

  @Get("deletion-requests")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.read")
  @ApiOperation({ summary: "Data deletion requests for this organization" })
  async listRequests(@CurrentOrganization() organizationId: string) {
    return prisma.dataDeletionRequest.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Erase one contact's personal data.
   *
   * TOKENIZE by default: identifying fields are replaced and the row structure
   * stays, so the organization's own conversation counts and response-time
   * reports do not silently change underneath them. PURGE deletes outright and
   * has to be asked for explicitly.
   */
  @Post("erase-contact")
  @UseGuards(PermissionGuard)
  @RequirePermission("contacts.delete")
  @ApiOperation({ summary: "Erase a contact's personal data (tokenize or purge)" })
  async eraseContact(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: any,
    @Body() dto: { contactId: string; mode?: "TOKENIZE" | "PURGE"; reason?: string }
  ) {
    const request = await prisma.dataDeletionRequest.create({
      data: {
        organizationId,
        requestedById: user.id,
        status: "PROCESSING",
        deletionType: dto.mode ?? "TOKENIZE",
        reason: dto.reason,
      },
    });

    try {
      const result = await this.erasure.eraseContact({
        organizationId,
        contactId: dto.contactId,
        mode: dto.mode ?? "TOKENIZE",
        actorUserId: user.id,
        reason: dto.reason,
      });
      await prisma.dataDeletionRequest.update({
        where: { id: request.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      return { ...result, requestId: request.id };
    } catch (error) {
      // The request row records the failure rather than disappearing, so an
      // erasure that did not happen is visible instead of silently forgotten.
      await prisma.dataDeletionRequest.update({
        where: { id: request.id },
        data: { status: "FAILED" },
      });
      throw error;
    }
  }

  @Post("retention/run")
  @UseGuards(PermissionGuard)
  @RequirePermission("settings.update")
  @ApiOperation({ summary: "Run the retention sweep now (it also runs nightly)" })
  async runRetention() {
    return this.retention.run();
  }
}
