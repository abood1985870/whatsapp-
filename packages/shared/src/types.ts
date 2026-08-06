// Remove unused z import
import {
  ORGANIZATION_STATUSES,
  MEMBERSHIP_STATUSES,
  CONNECTION_STATUSES,
  CONVERSATION_STATUSES,
  CONVERSATION_MODES,
  MESSAGE_DIRECTIONS,
  SENDER_TYPES,
  MESSAGE_TYPES,
  PROVIDER_STATUSES,
  AGENT_STATUSES,
  WEBHOOK_STATUSES,
  KNOWLEDGE_STATUSES,
} from "./constants";

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];
export type ConversationMode = (typeof CONVERSATION_MODES)[number];
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];
export type SenderType = (typeof SENDER_TYPES)[number];
export type MessageType = (typeof MESSAGE_TYPES)[number];
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type WebhookStatus = (typeof WEBHOOK_STATUSES)[number];
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export type ApiErrorResponse = {
  error: {
    code: string;
    message: string;
    localizedMessage?: string;
    fieldErrors?: Record<string, string[]>;
    correlationId: string;
  };
};

export type AgentDecision = {
  action: "REPLY" | "ASK_CLARIFICATION" | "CALL_TOOL" | "HANDOFF" | "NO_REPLY";
  replyText?: string;
  handoffReason?: string;
  confidence: number;
  citations: Array<{
    sourceId: string;
    chunkId: string;
    pageNumber?: number;
  }>;
  toolCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  internalReasonCode: string;
};
