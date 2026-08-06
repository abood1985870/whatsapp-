import { Controller, Post, Body, Headers, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { WebhooksService } from "./webhooks.service";

@ApiTags("Webhooks")
@Controller({ path: "webhooks", version: "1" })
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);
  constructor(private readonly webhooksService: WebhooksService) {}
  @Post("evolution") @ApiOperation({ summary: "Receive Evolution API webhook" }) async evolutionWebhook(@Body() payload: any, @Headers() headers: any) { this.logger.log(`Received webhook: ${payload?.event}`); return this.webhooksService.processEvolutionWebhook(payload, headers); }
}
