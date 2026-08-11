const db: any = {
  contact: { findFirst: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
  conversation: { findMany: jest.fn(), deleteMany: jest.fn() },
  message: { updateMany: jest.fn(), deleteMany: jest.fn() },
  callTranscriptTurn: { updateMany: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  call: { updateMany: jest.fn(), deleteMany: jest.fn() },
  faqEntry: { deleteMany: jest.fn() },
  voiceSettings: { findMany: jest.fn() },
  webhookEvent: { deleteMany: jest.fn() },
};
jest.mock("@qanoai/database", () => ({ prisma: db }));
jest.mock("@nestjs/schedule", () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: "0 3 * * *" },
}));

import { ErasureService } from "../erasure.service";
import { RetentionService } from "../retention.service";

/**
 * Both of these existed in the schema and in neither case did any code act on
 * them: retention settings nothing read, and a DataDeletionRequest table
 * nothing processed. A person could ask to be forgotten, the request would be
 * recorded, and nothing would happen.
 */
describe("ErasureService", () => {
  const ORG = "org-1";
  const CONTACT = "contact-abcdef123456";
  let service: ErasureService;
  const audit = { log: jest.fn().mockResolvedValue({}) };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ErasureService(audit as any);
    db.contact.findFirst.mockResolvedValue({ id: CONTACT, primaryPhone: "+966501234567", name: "خالد" });
    db.conversation.findMany.mockResolvedValue([{ id: "conv-1" }]);
    for (const model of ["contact", "conversation", "message", "callTranscriptTurn", "call", "faqEntry"]) {
      for (const op of ["updateMany", "deleteMany"]) {
        db[model][op]?.mockResolvedValue({ count: 1 });
      }
    }
  });

  it("refuses a contact from another organization", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    await expect(
      service.eraseContact({ organizationId: ORG, contactId: "other", mode: "TOKENIZE", actorUserId: "u-1" })
    ).rejects.toThrow("CONTACT_NOT_FOUND");
    expect(db.contact.findFirst.mock.calls[0][0].where).toMatchObject({ organizationId: ORG });
  });

  it("rejects an unknown mode rather than guessing", async () => {
    await expect(
      service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "DELETE_EVERYTHING" as any, actorUserId: "u-1" })
    ).rejects.toThrow("INVALID_MODE");
  });

  describe("TOKENIZE", () => {
    it("replaces message text without deleting the rows", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "TOKENIZE", actorUserId: "u-1" });
      // Deleting them would silently rewrite the organization's own conversation
      // counts and response-time reports.
      expect(db.message.deleteMany).not.toHaveBeenCalled();
      expect(db.message.updateMany).toHaveBeenCalled();
      expect(db.message.updateMany.mock.calls[0][0].where).toMatchObject({ organizationId: ORG, contactId: CONTACT });
    });

    it("replaces the phone with a derived value rather than clearing it", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "TOKENIZE", actorUserId: "u-1" });
      const data = db.contact.updateMany.mock.calls[0][0].data;
      // The phone is the join key for the record and for the do-not-contact
      // list; clearing it would orphan both.
      expect(data.primaryPhone).toContain("deleted-");
      expect(data.normalizedPhone).toContain("deleted-");
      expect(data.name).not.toContain("خالد");
      expect(data.deletedAt).toBeInstanceOf(Date);
    });

    it("marks the contact opted out so nothing messages them again", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "TOKENIZE", actorUserId: "u-1" });
      expect(db.contact.updateMany.mock.calls[0][0].data.consentStatus).toBe("OPTED_OUT");
    });

    it("removes FAQ entries learned from this person's conversations", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "TOKENIZE", actorUserId: "u-1" });
      expect(db.faqEntry.deleteMany).toHaveBeenCalled();
    });

    it("writes an audit row with the number MASKED", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "TOKENIZE", actorUserId: "u-1" });
      const entry = audit.log.mock.calls[0][0];
      expect(entry.action).toBe("PRIVACY_ERASURE_TOKENIZE");
      // The audit row proves which request was honoured without becoming a copy
      // of the data that was just erased.
      expect(JSON.stringify(entry.metadata)).not.toContain("501234567");
    });
  });

  describe("PURGE", () => {
    it("deletes rather than tokenizes", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "PURGE", actorUserId: "u-1" });
      expect(db.message.deleteMany).toHaveBeenCalled();
      expect(db.conversation.deleteMany).toHaveBeenCalled();
      expect(db.contact.deleteMany).toHaveBeenCalled();
    });

    it("scopes every delete by organization", async () => {
      await service.eraseContact({ organizationId: ORG, contactId: CONTACT, mode: "PURGE", actorUserId: "u-1" });
      for (const call of [
        db.message.deleteMany.mock.calls[0][0],
        db.conversation.deleteMany.mock.calls[0][0],
        db.contact.deleteMany.mock.calls[0][0],
      ]) {
        expect(call.where.organizationId).toBe(ORG);
      }
    });
  });
});

describe("RetentionService", () => {
  let service: RetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RetentionService();
    db.voiceSettings.findMany.mockResolvedValue([]);
    db.callTranscriptTurn.findMany.mockResolvedValue([]);
    db.webhookEvent.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("only touches organizations that set a policy", async () => {
    await service.run();
    // A null retention means "no policy", not "delete after the default".
    expect(db.voiceSettings.findMany.mock.calls[0][0].where).toMatchObject({
      transcriptRetentionDays: { not: null },
    });
  });

  it("ignores a nonsensical retention of zero days", async () => {
    db.voiceSettings.findMany.mockResolvedValue([{ organizationId: "o-1", transcriptRetentionDays: 0 }]);
    const result = await service.run();
    expect(result.organizations).toBe(0);
    expect(db.callTranscriptTurn.findMany).not.toHaveBeenCalled();
  });

  it("deletes transcript turns past the cutoff, in batches", async () => {
    db.voiceSettings.findMany.mockResolvedValue([{ organizationId: "o-1", transcriptRetentionDays: 30 }]);
    db.callTranscriptTurn.findMany
      .mockResolvedValueOnce([{ id: "t-1" }, { id: "t-2" }])
      .mockResolvedValueOnce([]);
    db.callTranscriptTurn.deleteMany.mockResolvedValue({ count: 2 });

    const result = await service.run();
    expect(result.transcriptTurns).toBe(2);
  });

  it("prunes old webhook events, which nothing ever cleaned up", async () => {
    db.webhookEvent.deleteMany.mockResolvedValue({ count: 40 });
    const result = await service.run();
    expect(result.webhookEvents).toBe(40);
  });
});
