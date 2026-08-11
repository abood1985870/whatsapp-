import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import { IncomingMessage } from "http";
import { Duplex } from "stream";
import { WebSocket, WebSocketServer } from "ws";
import { CallOrchestratorService } from "./call-orchestrator.service";
import { StreamTokenService } from "./stream-token.service";

export const MEDIA_STREAM_PATH = "/v1/voice/media-stream";

/**
 * Raw WebSocket endpoint that the telephony provider streams call audio
 * to and from. Speaks Twilio Media Streams framing; the Simulation
 * provider uses the same shape so tests exercise the identical bridge.
 *
 * Every connection must present a valid single-use stream token bound to
 * a specific call — an unauthenticated socket could otherwise inject audio
 * into another customer's call.
 */
@Injectable()
export class MediaStreamGateway implements OnModuleInit {
  private readonly logger = new Logger(MediaStreamGateway.name);
  private wss: WebSocketServer | null = null;

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly orchestrator: CallOrchestratorService,
    private readonly streamTokens: StreamTokenService
  ) {}

  onModuleInit() {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      this.logger.warn("No HTTP server available; voice media stream endpoint is disabled");
      return;
    }

    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
      let pathname: string;
      try {
        pathname = new URL(request.url ?? "", "http://localhost").pathname;
      } catch {
        return;
      }
      // Leave every other upgrade (e.g. Socket.IO) untouched.
      if (pathname !== MEDIA_STREAM_PATH) return;

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws);
      });
    });

    this.logger.log(`Voice media stream endpoint ready at ${MEDIA_STREAM_PATH}`);
  }

  private handleConnection(ws: WebSocket) {
    let callId: string | null = null;
    let streamSid: string | null = null;
    let authenticated = false;

    // A socket that never authenticates is dropped quickly.
    const authTimer = setTimeout(() => {
      if (!authenticated) {
        this.logger.warn("Closing unauthenticated media stream socket");
        ws.close();
      }
    }, 10000);

    ws.on("message", (raw) => {
      void (async () => {
        let frame: any;
        try {
          frame = JSON.parse(raw.toString());
        } catch {
          return; // a malformed frame must not kill the call
        }

        switch (frame.event) {
          case "start": {
            streamSid = frame.start?.streamSid ?? null;
            const token = frame.start?.customParameters?.token;
            const verdict = this.streamTokens.verify(String(token ?? ""));
            if (!verdict.valid || !verdict.callId) {
              this.logger.warn(`Rejected media stream: ${verdict.reason ?? "INVALID_TOKEN"}`);
              ws.close();
              return;
            }
            authenticated = true;
            clearTimeout(authTimer);
            callId = verdict.callId;

            const started = await this.orchestrator.startMediaSession(callId, {
              sendAudioToCaller: (audioBase64) => {
                if (ws.readyState !== WebSocket.OPEN) return;
                ws.send(JSON.stringify({ event: "media", streamSid, media: { payload: audioBase64 } }));
              },
              closeTelephony: () => {
                if (ws.readyState === WebSocket.OPEN) ws.close();
              },
            });
            if (!started) ws.close();
            break;
          }

          case "media": {
            if (!authenticated || !callId) return;
            const payload = frame.media?.payload;
            if (typeof payload === "string" && payload.length > 0) {
              this.orchestrator.pushCallerAudio(callId, payload);
            }
            break;
          }

          case "stop": {
            if (callId) await this.orchestrator.endCall(callId, "PROVIDER_STREAM_STOPPED");
            ws.close();
            break;
          }

          default:
            break;
        }
      })().catch((error) =>
        this.logger.error(`Media stream frame failed: ${String(error?.message).slice(0, 200)}`)
      );
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      if (callId) {
        void this.orchestrator.endCall(callId, "MEDIA_SOCKET_CLOSED", "DISCONNECTED").catch(() => undefined);
      }
    });

    ws.on("error", (error: any) => {
      this.logger.warn(`Media stream socket error: ${String(error?.message).slice(0, 150)}`);
    });
  }
}
