import { Body, Controller, Headers, Logger, Post, Req, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { prisma } from "@qanoai/database";
import { config } from "@qanoai/config";
import { normalizePhoneStrict } from "@qanoai/shared";
import { CallOrchestratorService } from "./call-orchestrator.service";
import { VoiceProviderRegistry } from "./voice-provider.registry";
import { MEDIA_STREAM_PATH } from "./media-stream.gateway";

/**
 * Telephony provider webhooks. Deliberately unauthenticated by session —
 * authenticity comes from the provider's signature, verified inside the
 * adapter. An unsigned or mismatched request is rejected outright, so no
 * field in the body (caller id, call status) is ever trusted blindly.
 */
@ApiExcludeController()
@Controller({ path: "voice/webhooks", version: "1" })
export class VoiceWebhooksController {
  private readonly logger = new Logger(VoiceWebhooksController.name);

  constructor(
    private readonly orchestrator: CallOrchestratorService,
    private readonly registry: VoiceProviderRegistry
  ) {}

  @Post("twilio/incoming")
  async twilioIncoming(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const provider = this.registry.byId("TWILIO");
    const event = provider.validateWebhook(body, headers, this.fullUrl(req));
    if (!event) {
      this.logger.warn("Rejected unverified Twilio incoming-call webhook");
      return res.status(403).send("FORBIDDEN");
    }

    // Route by the dialled number, which is the tenant boundary here.
    const normalizedTo = normalizePhoneStrict(event.toNumber).normalized;
    const voiceNumber = await prisma.voiceNumber.findFirst({
      where: { normalizedPhone: normalizedTo, deletedAt: null },
    });
    if (!voiceNumber) {
      this.logger.warn(`Incoming call to unregistered number ${normalizedTo}`);
      const reject = provider.buildRejectInstruction("UNKNOWN_NUMBER");
      return res.type(reject.contentType).send(reject.body);
    }

    const decision = await this.orchestrator.admitInboundCall({
      organizationId: voiceNumber.organizationId,
      provider: "TWILIO",
      providerCallId: event.providerCallId,
      fromNumber: event.fromNumber,
      toNumber: event.toNumber,
      voiceNumberId: voiceNumber.id,
    });

    if (!decision.admitted) {
      const reject = provider.buildRejectInstruction(decision.reason, decision.spokenMessage);
      return res.type(reject.contentType).send(reject.body);
    }

    await prisma.voiceNumber
      .update({ where: { id: voiceNumber.id }, data: { lastInboundAt: new Date(), status: "READY" } })
      .catch(() => undefined);

    const answer = provider.buildAnswerInstruction({
      streamUrl: this.mediaStreamUrl(),
      streamToken: decision.streamToken,
      greeting: undefined,
    });
    return res.type(answer.contentType).send(answer.body);
  }

  @Post("twilio/status")
  async twilioStatus(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const provider = this.registry.byId("TWILIO");
    const event = provider.validateWebhook(body, headers, this.fullUrl(req));
    if (!event) return res.status(403).send("FORBIDDEN");

    const call = await prisma.call.findUnique({
      where: { provider_providerCallId: { provider: "TWILIO", providerCallId: event.providerCallId } },
    });
    if (!call) return res.status(204).send();

    // Idempotency: providers redeliver, so an event we already stored is a no-op.
    const idempotencyKey = `TWILIO:${event.providerEventId ?? `${event.providerCallId}:${event.callStatus}`}`;
    const seen = await prisma.callEvent.findUnique({ where: { idempotencyKey } });
    if (seen) return res.status(204).send();

    await prisma.callEvent.create({
      data: {
        callId: call.id,
        eventType: "PROVIDER_STATUS",
        idempotencyKey,
        providerEventId: event.providerEventId,
        metadata: { callStatus: event.callStatus },
      },
    });

    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(String(event.callStatus))) {
      await this.orchestrator.endCall(
        call.id,
        `PROVIDER_${String(event.callStatus).toUpperCase()}`,
        event.callStatus === "completed" ? "COMPLETED" : "DISCONNECTED"
      );
    }
    return res.status(204).send();
  }

  private mediaStreamUrl(): string {
    const base = config.VOICE_PUBLIC_BASE_URL ?? "";
    return `${base.replace(/^http/, "ws")}${MEDIA_STREAM_PATH}`;
  }

  /** Twilio signs the exact URL it requested, so it must be rebuilt faithfully. */
  private fullUrl(req: Request): string {
    const base = config.VOICE_PUBLIC_BASE_URL;
    if (base) return `${base.replace(/\/$/, "")}${req.originalUrl}`;
    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
    return `${proto}://${req.get("host")}${req.originalUrl}`;
  }
}
