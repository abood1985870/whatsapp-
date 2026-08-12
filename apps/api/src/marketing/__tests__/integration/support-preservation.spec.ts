import { SalesConversationService } from "../../sales/sales-conversation.service";

/**
 * WhatsApp support regression guard.
 *
 * The sales handler must NEVER take over a conversation that isn't a
 * campaign conversation. handleInbound returns false (fall-through to the
 * existing support AI chain) whenever salesContext is missing or
 * incomplete — proving marketing changes don't globally switch normal
 * support conversations into sales mode.
 */
describe("SalesConversationService — support preservation", () => {
  const svc = new SalesConversationService(null as any, null as any, null as any, null as any, null as any);

  const baseInput = {
    organizationId: "org1",
    contact: { id: "c1", primaryPhone: "+966500000000", normalizedPhone: "966500000000" },
    connection: { id: "conn1", providerInstanceId: "inst1" },
    messageText: "السلام عليكم، عندي استفسار",
    inboundMessageId: "m1",
  };

  it("returns false when the conversation has no salesContext (normal support)", async () => {
    const handled = await svc.handleInbound({ ...baseInput, conversation: { id: "cv1", metadata: {} } });
    expect(handled).toBe(false);
  });

  it("returns false when salesContext is incomplete (no product/lead)", async () => {
    const handled = await svc.handleInbound({
      ...baseInput,
      conversation: { id: "cv1", metadata: { salesContext: { campaignId: "camp1" } } },
    });
    expect(handled).toBe(false);
  });

  it("returns false (fail-open) when metadata is null", async () => {
    const handled = await svc.handleInbound({ ...baseInput, conversation: { id: "cv1", metadata: null } });
    expect(handled).toBe(false);
  });
});
