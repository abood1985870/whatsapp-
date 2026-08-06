import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth, ApiOperation } from "@nestjs/swagger";
import { AuditService } from "./audit.service";
import { AuthGuard } from "../common/guards/auth.guard";
import { PermissionGuard } from "../common/guards/permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";

@ApiTags("Audit Logs")
@Controller({ path: "audit", version: "1" })
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}
  @Get() @UseGuards(PermissionGuard) @RequirePermission("audit.read") async list(@Query("organizationId") organizationId: string, @Query("page") page?: number, @Query("limit") limit?: number) { return this.auditService.findByOrganization(organizationId, page || 1, limit || 50); }
}
