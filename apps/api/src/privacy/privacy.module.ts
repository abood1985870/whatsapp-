import { Module } from "@nestjs/common";
import { PrivacyController } from "./privacy.controller";
import { ErasureService } from "./erasure.service";
import { RetentionService } from "./retention.service";
import { AuditModule } from "../audit/audit.module";

/**
 * Retention and erasure.
 *
 * Both existed in the schema and neither existed in code: retention settings
 * that nothing read, and a DataDeletionRequest table that nothing acted on.
 */
@Module({
  imports: [AuditModule],
  controllers: [PrivacyController],
  providers: [ErasureService, RetentionService],
  exports: [ErasureService, RetentionService],
})
export class PrivacyModule {}
