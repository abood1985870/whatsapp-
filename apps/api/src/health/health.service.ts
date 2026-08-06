import { Injectable } from "@nestjs/common";
import { prisma } from "@qanoai/database";

@Injectable()
export class HealthService {
  async check(): Promise<any> { return { status: "ok", timestamp: new Date().toISOString() }; }
  async ready(): Promise<any> {
    try { await prisma.$queryRaw`SELECT 1`; return { status: "ready", database: "connected", timestamp: new Date().toISOString() }; } catch { return { status: "not_ready", database: "disconnected", timestamp: new Date().toISOString() }; }
  }
}
