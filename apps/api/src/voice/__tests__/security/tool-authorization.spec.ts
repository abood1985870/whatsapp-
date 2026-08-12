import { authorizeToolCall, ToolAuthorizationInput } from "../../tools/tool-authorization";

const base: ToolAuthorizationInput = {
  toolId: "lookupProduct",
  rawArguments: { query: "نظام محاسبة" },
  agentRole: "SALES",
  agentAllowedTools: ["lookupProduct", "requestDiscountOffer", "lookupCustomerRecord", "createSupportRequest"],
  toolsEnabledForOrg: true,
  toolsEntitlementEnabled: true,
  verifiedScopes: [],
  otpAvailable: true,
  executionsSoFar: 0,
};

describe("voice tool authorization", () => {
  it("allows a well-formed call to an enabled tool", () => {
    const result = authorizeToolCall(base);
    expect(result.allowed).toBe(true);
  });

  it("refuses a tool that does not exist", () => {
    const result = authorizeToolCall({ ...base, toolId: "dropAllTables" });
    expect(result).toMatchObject({ allowed: false, reason: "UNKNOWN_TOOL" });
  });

  it("refuses a tool the owner did not enable on this agent", () => {
    const result = authorizeToolCall({ ...base, agentAllowedTools: ["createSupportRequest"] });
    expect(result).toMatchObject({ allowed: false, reason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });

  it("refuses everything when the org kill switch for tools is off", () => {
    expect(authorizeToolCall({ ...base, toolsEnabledForOrg: false })).toMatchObject({
      allowed: false,
      reason: "TOOLS_DISABLED",
    });
  });

  it("refuses everything without the VOICE_TOOLS entitlement", () => {
    expect(authorizeToolCall({ ...base, toolsEntitlementEnabled: false })).toMatchObject({
      allowed: false,
      reason: "ENTITLEMENT_DISABLED",
    });
  });

  it("refuses a sales-only tool for a non-sales role", () => {
    const result = authorizeToolCall({
      ...base,
      toolId: "requestDiscountOffer",
      rawArguments: { productId: "p1", reason: "price objection" },
      agentRole: "SUPPORT",
    });
    expect(result).toMatchObject({ allowed: false, reason: "ROLE_NOT_ALLOWED" });
  });

  it("enforces the per-call rate limit", () => {
    const result = authorizeToolCall({ ...base, executionsSoFar: 99 });
    expect(result).toMatchObject({ allowed: false, reason: "RATE_LIMIT_EXCEEDED" });
  });

  it("requires verification for customer-private data", () => {
    const result = authorizeToolCall({
      ...base,
      toolId: "lookupCustomerRecord",
      rawArguments: { field: "CONTACT_PROFILE" },
    });
    expect(result).toMatchObject({ allowed: false, reason: "VERIFICATION_REQUIRED" });
  });

  it("allows customer-private data once the matching scope is verified", () => {
    const result = authorizeToolCall({
      ...base,
      toolId: "lookupCustomerRecord",
      rawArguments: { field: "CONTACT_PROFILE" },
      verifiedScopes: ["tool:lookupCustomerRecord"],
    });
    expect(result.allowed).toBe(true);
  });

  it("refuses rather than downgrades when OTP cannot be delivered", () => {
    const result = authorizeToolCall({
      ...base,
      toolId: "lookupCustomerRecord",
      rawArguments: { field: "CONTACT_PROFILE" },
      otpAvailable: false,
    });
    expect(result).toMatchObject({ allowed: false, reason: "VERIFICATION_UNAVAILABLE" });
  });

  it("rejects malformed and non-object arguments", () => {
    expect(authorizeToolCall({ ...base, rawArguments: "{not json" })).toMatchObject({
      allowed: false,
      reason: "INVALID_ARGUMENTS",
    });
    expect(authorizeToolCall({ ...base, rawArguments: ["array"] })).toMatchObject({
      allowed: false,
      reason: "INVALID_ARGUMENTS",
    });
  });

  it("rejects missing required arguments", () => {
    expect(authorizeToolCall({ ...base, rawArguments: {} })).toMatchObject({
      allowed: false,
      reason: "INVALID_ARGUMENTS",
    });
  });

  it("rejects values outside a declared enum", () => {
    const result = authorizeToolCall({
      ...base,
      toolId: "lookupCustomerRecord",
      rawArguments: { field: "ALL_CUSTOMERS" },
      verifiedScopes: ["tool:lookupCustomerRecord"],
    });
    expect(result).toMatchObject({ allowed: false, reason: "INVALID_ARGUMENTS" });
  });

  it("strips unknown keys so a model cannot smuggle extra fields (mass assignment)", () => {
    const result = authorizeToolCall({
      ...base,
      rawArguments: { query: "crm", organizationId: "victim-org", isAdmin: true, __proto__: { polluted: true } },
    });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.args).toEqual({ query: "crm" });
      expect(result.args.organizationId).toBeUndefined();
      expect(result.args.isAdmin).toBeUndefined();
    }
  });

  it("accepts a JSON string payload exactly like a parsed object", () => {
    const result = authorizeToolCall({ ...base, rawArguments: JSON.stringify({ query: "erp" }) });
    expect(result.allowed).toBe(true);
  });
});
