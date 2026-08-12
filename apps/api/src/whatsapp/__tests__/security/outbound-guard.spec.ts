const db: any = {
  marketingSettings: { findUnique: jest.fn() },
  dncEntry: { findUnique: jest.fn() },
  message: { count: jest.fn(), findFirst: jest.fn() },
};
jest.mock("@qanoai/database", () => ({ prisma: db }));

import { OutboundGuardService } from "../../outbound-guard.service";

/**
 * The single gate every outbound message passes through.
 *
 * Sixteen call sites sent WhatsApp messages and five consulted nothing: not the
 * do-not-contact list, not the opt-out the customer had already sent, not the
 * kill switch — which existed as a column nothing read, so turning it on did
 * nothing while the operator believed sending had stopped.
 *
 * The other half of the job is NOT over-blocking: a support reply must go out
 * at 2am, or the fix would break the product it protects.
 */
describe("OutboundGuardService", () => {
  let guard: OutboundGuardService;
  const ORG = "org-1";
  const PHONE = "+966501234567";

  const settings = (over: any = {}) => ({
    killSwitchEnabled: false,
    dailyOutboundCap: 1000,
    perContactMinIntervalHours: 20,
    quietHoursEnabled: false,
    quietHoursStart: 22,
    quietHoursEnd: 8,
    ...over,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new OutboundGuardService();
    db.marketingSettings.findUnique.mockResolvedValue(settings());
    db.dncEntry.findUnique.mockResolvedValue(null);
    db.message.count.mockResolvedValue(0);
    db.message.findFirst.mockResolvedValue(null);
  });

  it("allows an ordinary marketing send", async () => {
    const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
    expect(d.allowed).toBe(true);
  });

  it("refuses a number it cannot parse rather than handing it to the provider", async () => {
    const d = await guard.check({ organizationId: ORG, toPhone: "not-a-number", kind: "MARKETING" });
    expect(d).toMatchObject({ allowed: false, reason: "UNPARSEABLE_PHONE" });
  });

  describe("kill switch", () => {
    beforeEach(() => db.marketingSettings.findUnique.mockResolvedValue(settings({ killSwitchEnabled: true })));

    it.each(["MARKETING", "AI_REPLY", "SYSTEM_NOTICE"] as const)("stops %s", async (kind) => {
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind });
      expect(d).toMatchObject({ allowed: false, reason: "KILL_SWITCH_ENABLED" });
    });

    it("still lets a human send from the inbox — the escape hatch", async () => {
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "HUMAN_REPLY" });
      expect(d.allowed).toBe(true);
    });
  });

  describe("do-not-contact", () => {
    beforeEach(() => db.dncEntry.findUnique.mockResolvedValue({ isActive: true }));

    it("blocks marketing", async () => {
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(d).toMatchObject({ allowed: false, reason: "DO_NOT_CONTACT" });
    });

    it("blocks alerts to staff numbers on the list", async () => {
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "SYSTEM_NOTICE" });
      expect(d.allowed).toBe(false);
    });

    it("does NOT block answering a customer who is writing to us right now", async () => {
      // Opting out of marketing is not a request to be ignored when you ask a
      // question. Blocking here would leave a customer talking to silence.
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "AI_REPLY" })).allowed).toBe(true);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "HUMAN_REPLY" })).allowed).toBe(true);
    });
  });

  describe("daily cap", () => {
    it("blocks once the organization has hit its ceiling", async () => {
      db.message.count.mockResolvedValue(1000);
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(d).toMatchObject({ allowed: false, reason: "DAILY_CAP_REACHED" });
    });

    it("counts only marketing messages, not support replies", async () => {
      await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(db.message.count.mock.calls[0][0].where).toMatchObject({ isMarketing: true, direction: "OUTBOUND" });
    });

    it("does not apply to a reply", async () => {
      db.message.count.mockResolvedValue(99999);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "AI_REPLY" })).allowed).toBe(true);
    });
  });

  describe("per-contact frequency", () => {
    it("blocks a second marketing message inside the window", async () => {
      db.message.findFirst.mockResolvedValue({ id: "m-1" });
      const d = await guard.check({
        organizationId: ORG,
        toPhone: PHONE,
        kind: "MARKETING",
        contactId: "c-1",
      });
      expect(d).toMatchObject({ allowed: false, reason: "CONTACT_FREQUENCY_CAP" });
    });

    it("is skipped when no contact is identified", async () => {
      db.message.findFirst.mockResolvedValue({ id: "m-1" });
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(d.allowed).toBe(true);
    });
  });

  describe("quiet hours", () => {
    const at = (riyadhHour: number) => {
      // Riyadh is UTC+3 with no DST.
      const utcHour = (riyadhHour - 3 + 24) % 24;
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 0, 15, utcHour, 30)));
    };
    afterEach(() => jest.useRealTimers());

    beforeEach(() => db.marketingSettings.findUnique.mockResolvedValue(settings({ quietHoursEnabled: true })));

    it.each([23, 2, 7])("blocks marketing at %i:30 Riyadh", async (hour) => {
      at(hour);
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(d).toMatchObject({ allowed: false, reason: "QUIET_HOURS" });
    });

    it.each([9, 14, 21])("allows marketing at %i:30 Riyadh", async (hour) => {
      at(hour);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" })).allowed).toBe(true);
    });

    it("never holds back a support reply at 2am", async () => {
      at(2);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "AI_REPLY" })).allowed).toBe(true);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "HUMAN_REPLY" })).allowed).toBe(true);
    });
  });

  describe("an organization with no marketing settings row yet", () => {
    // Absent configuration means the DEFAULTS apply, including quiet hours.
    // Silence is not consent to message people at 3am.
    beforeEach(() => db.marketingSettings.findUnique.mockResolvedValue(null));
    afterEach(() => jest.useRealTimers());

    const atRiyadh = (hour: number) =>
      jest.useFakeTimers().setSystemTime(new Date(Date.UTC(2026, 0, 15, (hour - 3 + 24) % 24, 30)));

    it("sends during the day", async () => {
      atRiyadh(14);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" })).allowed).toBe(true);
    });

    it("still honours the default quiet hours at night", async () => {
      atRiyadh(3);
      const d = await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "MARKETING" });
      expect(d).toMatchObject({ allowed: false, reason: "QUIET_HOURS" });
    });

    it("never blocks a reply", async () => {
      atRiyadh(3);
      expect((await guard.check({ organizationId: ORG, toPhone: PHONE, kind: "AI_REPLY" })).allowed).toBe(true);
    });
  });
});
