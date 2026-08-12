import { VoiceToolDefinition, findTool } from "./tool-registry";

export type ToolDenyReason =
  | "UNKNOWN_TOOL"
  | "TOOLS_DISABLED"
  | "TOOL_NOT_ALLOWED_FOR_AGENT"
  | "ROLE_NOT_ALLOWED"
  | "INVALID_ARGUMENTS"
  | "VERIFICATION_REQUIRED"
  | "VERIFICATION_UNAVAILABLE"
  | "RATE_LIMIT_EXCEEDED"
  | "ENTITLEMENT_DISABLED";

export interface ToolAuthorizationInput {
  toolId: string;
  rawArguments: unknown;
  agentRole: string;
  /** Tools the owner explicitly enabled on this agent. Empty means none. */
  agentAllowedTools: string[];
  toolsEnabledForOrg: boolean;
  toolsEntitlementEnabled: boolean;
  /** Scopes already verified during THIS call. */
  verifiedScopes: string[];
  /** False when no SMS provider is configured, so OTP cannot be performed. */
  otpAvailable: boolean;
  executionsSoFar: number;
}

export type ToolAuthorizationResult =
  | { allowed: true; tool: VoiceToolDefinition; args: Record<string, unknown> }
  | { allowed: false; reason: ToolDenyReason; detail?: string };

/**
 * Pure authorization decision for one model tool call. No I/O, so it is
 * directly unit-testable and cannot be bypassed by anything the caller says.
 *
 * Note what is absent by design: tenant identifiers. The executor supplies
 * organizationId/callId/contactId from the server-side call record, so a
 * model cannot target another tenant no matter what it emits.
 */
export function authorizeToolCall(input: ToolAuthorizationInput): ToolAuthorizationResult {
  const tool = findTool(input.toolId);
  if (!tool) return { allowed: false, reason: "UNKNOWN_TOOL" };

  if (!input.toolsEntitlementEnabled) return { allowed: false, reason: "ENTITLEMENT_DISABLED" };
  if (!input.toolsEnabledForOrg) return { allowed: false, reason: "TOOLS_DISABLED" };
  if (!input.agentAllowedTools.includes(tool.id)) return { allowed: false, reason: "TOOL_NOT_ALLOWED_FOR_AGENT" };
  if (!tool.allowedRoles.includes(input.agentRole)) return { allowed: false, reason: "ROLE_NOT_ALLOWED" };
  if (input.executionsSoFar >= tool.maxPerCall) return { allowed: false, reason: "RATE_LIMIT_EXCEEDED" };

  const parsed = parseArguments(input.rawArguments);
  if (!parsed.ok) return { allowed: false, reason: "INVALID_ARGUMENTS", detail: parsed.error };

  const schemaCheck = validateAgainstSchema(parsed.value, tool.parameters);
  if (!schemaCheck.ok) return { allowed: false, reason: "INVALID_ARGUMENTS", detail: schemaCheck.error };

  if (tool.verificationLevel !== "NO_VERIFICATION") {
    const scope = `tool:${tool.id}`;
    const verified = input.verifiedScopes.includes(scope) || input.verifiedScopes.includes("*");
    if (!verified) {
      // Refuse rather than silently downgrade when OTP cannot be delivered.
      if (tool.verificationLevel === "OTP_REQUIRED" && !input.otpAvailable) {
        return { allowed: false, reason: "VERIFICATION_UNAVAILABLE" };
      }
      return { allowed: false, reason: "VERIFICATION_REQUIRED" };
    }
  }

  return { allowed: true, tool, args: schemaCheck.value };
}

function parseArguments(raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "UNPARSEABLE_JSON" };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "NOT_AN_OBJECT" };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

/**
 * Minimal JSON-Schema subset validator covering exactly what the registry
 * uses (object/string/number/boolean/array/enum/required). Unknown keys are
 * dropped rather than passed through, which also blocks mass assignment.
 */
function validateAgainstSchema(
  value: Record<string, unknown>,
  schema: Record<string, any>
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const properties: Record<string, any> = schema.properties ?? {};
  const required: string[] = schema.required ?? [];
  const clean: Record<string, unknown> = {};

  for (const key of required) {
    if (value[key] === undefined || value[key] === null || value[key] === "") {
      return { ok: false, error: `MISSING_REQUIRED:${key}` };
    }
  }

  for (const [key, spec] of Object.entries(properties)) {
    const raw = value[key];
    if (raw === undefined || raw === null) continue;

    switch (spec.type) {
      case "string": {
        if (typeof raw !== "string") return { ok: false, error: `EXPECTED_STRING:${key}` };
        if (Array.isArray(spec.enum) && !spec.enum.includes(raw)) return { ok: false, error: `INVALID_ENUM:${key}` };
        clean[key] = raw.slice(0, 2000);
        break;
      }
      case "number":
      case "integer": {
        const num = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(num)) return { ok: false, error: `EXPECTED_NUMBER:${key}` };
        clean[key] = num;
        break;
      }
      case "boolean": {
        if (typeof raw !== "boolean") return { ok: false, error: `EXPECTED_BOOLEAN:${key}` };
        clean[key] = raw;
        break;
      }
      case "array": {
        if (!Array.isArray(raw)) return { ok: false, error: `EXPECTED_ARRAY:${key}` };
        clean[key] = raw.slice(0, 50).map((item) => String(item).slice(0, 500));
        break;
      }
      default: {
        if (Array.isArray(spec.enum)) {
          if (!spec.enum.includes(raw)) return { ok: false, error: `INVALID_ENUM:${key}` };
          clean[key] = raw;
        } else {
          clean[key] = raw;
        }
      }
    }
  }

  return { ok: true, value: clean };
}
