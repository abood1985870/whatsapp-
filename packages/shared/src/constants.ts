export const ORGANIZATION_STATUSES = [
  "TRIAL",
  "ACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "CANCELLED",
] as const;

export const MEMBERSHIP_STATUSES = [
  "INVITED",
  "ACTIVE",
  "SUSPENDED",
  "REMOVED",
] as const;

export const SYSTEM_ROLES = [
  "PLATFORM_SUPER_ADMIN",
  "ORGANIZATION_OWNER",
  "ORGANIZATION_ADMIN",
  "SUPPORT_MANAGER",
  "SUPPORT_AGENT",
  "ANALYST",
  "READ_ONLY",
] as const;

export const CONNECTION_STATUSES = [
  "NOT_CREATED",
  "CREATING",
  "QR_REQUIRED",
  "QR_EXPIRED",
  "CONNECTING",
  "CONNECTED",
  "RECONNECTING",
  "DISCONNECTED",
  "AUTH_FAILURE",
  "BANNED_OR_RESTRICTED",
  "PROVIDER_UNAVAILABLE",
  "ERROR",
] as const;

export const CONVERSATION_STATUSES = [
  "NEW",
  "OPEN",
  "WAITING_FOR_AGENT",
  "WAITING_FOR_CUSTOMER",
  "SNOOZED",
  "RESOLVED",
  "CLOSED",
  "SPAM",
  "BLOCKED",
] as const;

export const CONVERSATION_MODES = [
  "AI_AUTOMATIC",
  "AI_SUGGESTIONS_ONLY",
  "HUMAN_ONLY",
  "PAUSED",
] as const;

export const MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND", "INTERNAL"] as const;

export const SENDER_TYPES = [
  "CUSTOMER",
  "AI",
  "HUMAN",
  "SYSTEM",
  "INTEGRATION",
] as const;

export const MESSAGE_TYPES = [
  "TEXT",
  "IMAGE",
  "VIDEO",
  "AUDIO",
  "VOICE_NOTE",
  "DOCUMENT",
  "LOCATION",
  "CONTACT",
  "STICKER",
  "REACTION",
  "SYSTEM",
  "UNSUPPORTED",
] as const;

export const PROVIDER_STATUSES = [
  "PENDING",
  "QUEUED",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
] as const;

export const AGENT_STATUSES = [
  "DRAFT",
  "TESTING",
  "ACTIVE",
  "PAUSED",
  "ARCHIVED",
] as const;

export const WEBHOOK_STATUSES = [
  "RECEIVED",
  "QUEUED",
  "PROCESSING",
  "PROCESSED",
  "IGNORED",
  "FAILED",
  "DEAD_LETTER",
] as const;

export const KNOWLEDGE_STATUSES = [
  "UPLOADED",
  "QUEUED",
  "PROCESSING",
  "READY",
  "FAILED",
  "ARCHIVED",
] as const;

export const DEFAULT_LOCALE = "ar";
export const DEFAULT_TIMEZONE = "Asia/Riyadh";
export const DEFAULT_CURRENCY = "SAR";
export const DEFAULT_COUNTRY = "SA";
