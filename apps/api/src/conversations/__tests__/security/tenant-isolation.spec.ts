const db: any = {
  conversation: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  membership: { findFirst: jest.fn() },
  tag: { findFirst: jest.fn() },
  assignmentHistory: { create: jest.fn(), createMany: jest.fn(), findMany: jest.fn() },
  conversationTag: { create: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn() },
  conversationWatcher: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  conversationEvent: { create: jest.fn() },
  internalNote: { findMany: jest.fn(), create: jest.fn() },
};

jest.mock("@qanoai/database", () => ({ prisma: db }));
jest.mock("@qanoai/queue", () => ({
  queues: { conversationSummary: { add: jest.fn() } },
  emitToOrganization: jest.fn(),
}));

import { ConversationsService } from "../../conversations.service";

/**
 * The tenant boundary at the data layer.
 *
 * Every one of these methods used to address a conversation by id alone. The
 * guard confirmed the caller had `conversations.read` in THEIR organization,
 * then the query fetched whatever row the id named, in ANY organization. These
 * tests assert the thing that actually matters: organizationId appears in the
 * `where` of every read and every write.
 */
describe("ConversationsService tenant scoping", () => {
  const ORG = "org-mine";
  const OTHER = "org-theirs";
  let service: ConversationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService();
    db.conversation.findFirst.mockResolvedValue({ id: "c-1", organizationId: ORG });
    db.conversation.updateMany.mockResolvedValue({ count: 1 });
    db.conversation.findUnique.mockResolvedValue({ id: "c-1" });
    db.membership.findFirst.mockResolvedValue({ id: "m-1" });
    db.tag.findFirst.mockResolvedValue({ id: "t-1" });
  });

  const whereOf = (mock: jest.Mock, call = 0) => mock.mock.calls[call][0].where;

  it("findOne filters by organizationId", async () => {
    await service.findOne("c-1", ORG);
    expect(whereOf(db.conversation.findFirst)).toMatchObject({ id: "c-1", organizationId: ORG });
  });

  it("findOne 404s rather than returning another tenant's conversation", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    await expect(service.findOne("c-theirs", ORG)).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });

  it.each([
    ["update", () => service.update("c-1", ORG, { status: "OPEN" })],
    ["snooze", () => service.snooze("c-1", ORG, new Date())],
    ["unsnooze", () => service.unsnooze("c-1", ORG)],
    ["reopen", () => service.reopen("c-1", ORG)],
    ["block", () => service.block("c-1", ORG)],
  ])("%s writes through a scoped updateMany", async (_name, run) => {
    await run();
    expect(whereOf(db.conversation.updateMany)).toMatchObject({ id: "c-1", organizationId: ORG });
  });

  it("a write against another tenant's id is a no-op, not a success", async () => {
    db.conversation.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.block("c-theirs", ORG)).rejects.toThrow("CONVERSATION_NOT_FOUND");
  });

  it("assign refuses a membership from another organization", async () => {
    db.membership.findFirst.mockResolvedValue(null);
    await expect(service.assign("c-1", ORG, "m-theirs")).rejects.toThrow("MEMBERSHIP_NOT_IN_ORGANIZATION");
    expect(db.assignmentHistory.create).not.toHaveBeenCalled();
  });

  it("addTag refuses a tag from another organization", async () => {
    db.tag.findFirst.mockResolvedValue(null);
    await expect(service.addTag("c-1", ORG, "tag-theirs")).rejects.toThrow("TAG_NOT_IN_ORGANIZATION");
    expect(db.conversationTag.create).not.toHaveBeenCalled();
  });

  it("merge requires BOTH conversations to be ours", async () => {
    db.conversation.findFirst
      .mockResolvedValueOnce({ id: "c-1" }) // source: ours
      .mockResolvedValueOnce(null); // target: theirs
    await expect(service.merge("c-1", ORG, "c-theirs")).rejects.toThrow("CONVERSATION_NOT_FOUND");
    expect(db.conversationEvent.create).not.toHaveBeenCalled();
  });

  it("bulkAction re-resolves ids against the organization before writing", async () => {
    // The caller sends three ids; only two are theirs.
    db.conversation.findMany.mockResolvedValue([{ id: "c-1" }, { id: "c-2" }]);
    const result = await service.bulkAction(ORG, ["c-1", "c-2", "c-theirs"], "CLOSE");

    expect(whereOf(db.conversation.findMany)).toMatchObject({ organizationId: ORG });
    // The write only ever sees the ids that survived that filter.
    expect(db.conversation.updateMany.mock.calls[0][0].where.id.in).toEqual(["c-1", "c-2"]);
    expect(result.updatedCount).toBe(2);
  });

  it("bulkAction ASSIGN writes history only for owned ids", async () => {
    db.conversation.findMany.mockResolvedValue([{ id: "c-1" }]);
    await service.bulkAction(ORG, ["c-1", "c-theirs"], "ASSIGN", { membershipId: "m-1" });

    // assignmentHistory.createMany is NOT scoped by organization — it used the
    // caller's raw id list, so a foreign id got a history row written for it.
    const rows = db.assignmentHistory.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.conversationId)).toEqual(["c-1"]);
  });

  it("bulkAction is bounded", async () => {
    const many = Array.from({ length: 501 }, (_, i) => `c-${i}`);
    await expect(service.bulkAction(ORG, many, "CLOSE")).rejects.toThrow("TOO_MANY_CONVERSATIONS");
  });

  it("exportToCsv only exports this organization", async () => {
    db.conversation.findMany.mockResolvedValue([]);
    await service.exportToCsv(ORG);
    expect(whereOf(db.conversation.findMany)).toMatchObject({ organizationId: ORG, deletedAt: null });
  });

  it("exportToCsv quotes a contact name containing a comma and a quote", async () => {
    db.conversation.findMany.mockResolvedValue([
      {
        id: "c-1",
        status: "OPEN",
        mode: "AI_AUTOMATIC",
        priority: "NORMAL",
        contact: { name: 'شركة "الرواد", ltd', primaryPhone: "+966500000000" },
        assignedMembership: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastMessageAt: null,
      },
    ]);
    const csv = await service.exportToCsv(ORG);
    const row = csv.split("\n")[1];
    // Nine columns survive despite the comma inside the name.
    expect(row.match(/","/g)?.length).toBe(8);
    expect(row).toContain('""الرواد""');
  });

  it("does not scope by OTHER when asked for ORG", async () => {
    await service.findOne("c-1", ORG);
    expect(JSON.stringify(whereOf(db.conversation.findFirst))).not.toContain(OTHER);
  });
});
