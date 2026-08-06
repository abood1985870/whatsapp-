import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  organizationName: z.string().min(2).max(100),
});

export const createOrganizationSchema = z.object({
  legalName: z.string().min(2).max(100),
  displayName: z.string().optional(),
  industry: z.string().optional(),
  country: z.string().default("SA"),
  timezone: z.string().default("Asia/Riyadh"),
  locale: z.string().default("ar"),
  currency: z.string().default("SAR"),
});

export const createConnectionSchema = z.object({
  name: z.string().min(1).max(100),
  branchId: z.string().optional(),
  teamId: z.string().optional(),
});

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1).max(4000),
  quotedMessageId: z.string().optional(),
});

export const updateConversationSchema = z.object({
  status: z.enum(["NEW", "OPEN", "WAITING_FOR_AGENT", "WAITING_FOR_CUSTOMER", "SNOOZED", "RESOLVED", "CLOSED", "SPAM", "BLOCKED"]).optional(),
  mode: z.enum(["AI_AUTOMATIC", "AI_SUGGESTIONS_ONLY", "HUMAN_ONLY", "PAUSED"]).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  assignedMembershipId: z.string().optional(),
  teamId: z.string().optional(),
  snoozedUntil: z.string().datetime().optional(),
});

export const createContactSchema = z.object({
  primaryPhone: z.string().min(8).max(20),
  name: z.string().optional(),
  email: z.string().email().optional(),
  language: z.string().optional(),
  company: z.string().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
});

export const createAgentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  defaultLanguage: z.string().default("ar"),
  tone: z.string().default("PROFESSIONAL"),
  systemInstructions: z.string().optional(),
  greetingMessage: z.string().optional(),
  fallbackMessage: z.string().optional(),
  handoffMessage: z.string().optional(),
  confidenceThreshold: z.number().min(0).max(1).default(0.7),
  autoReplyEnabled: z.boolean().default(true),
});

export const uploadKnowledgeSchema = z.object({
  knowledgeBaseId: z.string(),
  name: z.string().min(1),
  sourceType: z.enum(["PDF", "DOCX", "TXT", "MARKDOWN", "CSV", "FAQ", "URL"]),
  sourceUrl: z.string().url().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type CreateContactInput = z.infer<typeof createContactSchema>;
export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UploadKnowledgeInput = z.infer<typeof uploadKnowledgeSchema>;
