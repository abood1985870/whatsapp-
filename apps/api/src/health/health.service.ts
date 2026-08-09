import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";
import { redisConnection } from "@qanoai/queue";

@Injectable()
export class HealthService {
  async check(): Promise<any> { return { status: "ok", timestamp: new Date().toISOString() }; }
  async ready(): Promise<any> {
    const checks = { database: "disconnected", redis: "disconnected" };

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = "connected";
    } catch {
      checks.database = "disconnected";
    }

    try {
      await redisConnection.ping();
      checks.redis = "connected";
    } catch {
      checks.redis = "disconnected";
    }

    const ready = checks.database === "connected" && checks.redis === "connected";
    return { status: ready ? "ready" : "not_ready", ...checks, timestamp: new Date().toISOString() };
  }
}
