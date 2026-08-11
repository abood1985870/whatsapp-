const db: any = {
  call: { findMany: jest.fn(), updateMany: jest.fn() },
  callEvent: { create: jest.fn() },
};
jest.mock("@qanoai/database", () => ({ prisma: db }));
jest.mock("@nestjs/schedule", () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_10_MINUTES: "*/10 * * * *" },
}));

import { StaleCallSweeperService } from "../../stale-call-sweeper.service";

/**
 * A call whose hangup never arrived stays "in progress" forever: it eats the
 * tenant's concurrent-line limit, never gets a usage record, and shows on the
 * dashboard as live. The sweeper closes those, and must not touch a call that
 * is merely long.
 */
describe("StaleCallSweeperService", () => {
  let service: StaleCallSweeperService;
  const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StaleCallSweeperService();
    db.call.updateMany.mockResolvedValue({ count: 1 });
    db.callEvent.create.mockResolvedValue({});
  });

  it("closes a call long past its agent's limit", async () => {
    db.call.findMany.mockResolvedValue([
      { id: "c-1", organizationId: "o-1", startedAt: minutesAgo(120), agent: { maxCallSeconds: 600 } },
    ]);

    const result = await service.sweep();

    expect(result.closed).toBe(1);
    const call = db.call.updateMany.mock.calls[0][0];
    expect(call.data.status).toBe("DISCONNECTED");
    expect(call.data.endReason).toBe("SWEPT_NO_PROVIDER_HANGUP");
    // Duration is capped at the agent's limit rather than the wall-clock age —
    // billing a two-hour session for a ten-minute call would be worse than the bug.
    expect(call.data.durationSeconds).toBe(600);
  });

  it("leaves a call that is inside its limit plus grace", async () => {
    db.call.findMany.mockResolvedValue([
      { id: "c-2", organizationId: "o-1", startedAt: minutesAgo(35), agent: { maxCallSeconds: 1800 } },
    ]);

    const result = await service.sweep();
    expect(result.closed).toBe(0);
    expect(db.call.updateMany).not.toHaveBeenCalled();
  });

  it("re-checks the live status in the WHERE clause, so a real hangup wins the race", async () => {
    db.call.findMany.mockResolvedValue([
      { id: "c-3", organizationId: "o-1", startedAt: minutesAgo(120), agent: { maxCallSeconds: 600 } },
    ]);
    await service.sweep();
    expect(db.call.updateMany.mock.calls[0][0].where.status.in).toContain("IN_PROGRESS");
  });

  it("counts nothing when the row was already closed by the provider", async () => {
    db.call.findMany.mockResolvedValue([
      { id: "c-4", organizationId: "o-1", startedAt: minutesAgo(120), agent: { maxCallSeconds: 600 } },
    ]);
    db.call.updateMany.mockResolvedValue({ count: 0 });

    const result = await service.sweep();
    expect(result.closed).toBe(0);
    expect(db.callEvent.create).not.toHaveBeenCalled();
  });

  it("falls back to a default limit when the call has no agent", async () => {
    db.call.findMany.mockResolvedValue([
      { id: "c-5", organizationId: "o-1", startedAt: minutesAgo(90), agent: null },
    ]);
    const result = await service.sweep();
    expect(result.closed).toBe(1);
  });

  it("does nothing when there is nothing to sweep", async () => {
    db.call.findMany.mockResolvedValue([]);
    expect((await service.sweep()).closed).toBe(0);
  });
});
