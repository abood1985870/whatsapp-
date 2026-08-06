import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { HealthService } from "./health.service";

@ApiTags("Health")
@Controller({ path: "health", version: "1" })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  @Get() @ApiOperation({ summary: "Health check" }) async check(): Promise<any> { return this.healthService.check(); }
  @Get("ready") @ApiOperation({ summary: "Readiness check" }) async ready(): Promise<any> { return this.healthService.ready(); }
}
