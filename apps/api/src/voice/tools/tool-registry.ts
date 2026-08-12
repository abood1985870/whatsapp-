export type VerificationLevel = "NO_VERIFICATION" | "BASIC_VERIFICATION" | "OTP_REQUIRED";
export type DataSensitivity = "PUBLIC" | "INTERNAL" | "CUSTOMER_PRIVATE";

export interface VoiceToolDefinition {
  id: string;
  name: string;
  description: string;
  /** JSON Schema handed to the model. */
  parameters: Record<string, unknown>;
  timeoutMs: number;
  verificationLevel: VerificationLevel;
  requiresConfirmation: boolean;
  /** Max executions per call. Bounds both cost and abuse. */
  maxPerCall: number;
  /** When true, repeated identical input returns the first result. */
  idempotent: boolean;
  sensitivity: DataSensitivity;
  allowedRoles: string[];
}

const ALL_ROLES = ["SALES", "SUPPORT", "RECEPTION"];

/**
 * The complete set of actions the voice model may request. Anything not
 * listed here cannot be executed — the model has no general database or
 * network access. `organizationId`, `callId`, `contactId` and `leadId` are
 * deliberately NOT parameters: they are taken from the server-side call
 * record so a model (or a caller coaching it) cannot reach another tenant.
 */
export const VOICE_TOOLS: VoiceToolDefinition[] = [
  {
    id: "lookupProduct",
    name: "lookupProduct",
    description: "ابحث عن برنامج في كتالوج الشركة واحصل على سعره الرسمي ومزاياه. هذا هو المصدر الوحيد للسعر.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "اسم البرنامج أو وصف حاجة العميل" } },
      required: ["query"],
    },
    timeoutMs: 5000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 8,
    idempotent: true,
    sensitivity: "PUBLIC",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "captureDetails",
    name: "captureDetails",
    description: "سجّل بيانات العميل التي ذكرها في المكالمة (الاسم، اسم المنشأة، النشاط، الاحتياج).",
    parameters: {
      type: "object",
      properties: {
        contactName: { type: "string" },
        businessName: { type: "string" },
        businessType: { type: "string" },
        need: { type: "string" },
        city: { type: "string" },
      },
    },
    timeoutMs: 5000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 5,
    idempotent: false,
    sensitivity: "INTERNAL",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "updateLeadInterest",
    name: "updateLeadInterest",
    description: "حدّث اهتمام العميل بالبرنامج ومستوى نية الشراء.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "معرّف البرنامج من نتيجة lookupProduct" },
        interestLevel: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH", "READY_TO_BUY"] },
        reason: { type: "string" },
      },
      required: ["interestLevel"],
    },
    timeoutMs: 5000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 6,
    idempotent: false,
    sensitivity: "INTERNAL",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "requestDiscountOffer",
    name: "requestDiscountOffer",
    description:
      "اطلب من النظام احتساب خصم مسموح. أنت لا تحسب الخصم بنفسك. استخدمها فقط عند اهتمام حقيقي والسعر هو العائق الأخير.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        reason: { type: "string", description: "لماذا يستحق هذا العميل عرضاً الآن" },
      },
      required: ["productId", "reason"],
    },
    timeoutMs: 5000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 2,
    idempotent: true,
    sensitivity: "INTERNAL",
    allowedRoles: ["SALES"],
  },
  {
    id: "createSupportRequest",
    name: "createSupportRequest",
    description: "أنشئ طلب دعم ليتواصل الفريق البشري مع العميل. استخدمها عند طلب موظف بشري أو مشكلة تحتاج تدخلاً.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        details: { type: "string" },
        urgency: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
      },
      required: ["reason"],
    },
    timeoutMs: 8000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 3,
    idempotent: false,
    sensitivity: "INTERNAL",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "createCustomSoftwareRequest",
    name: "createCustomSoftwareRequest",
    description: "سجّل طلب برمجة خاصة. لا تذكر سعراً ولا مدة تسليم إطلاقاً.",
    parameters: {
      type: "object",
      properties: {
        companyActivity: { type: "string" },
        problem: { type: "string" },
        desiredSolution: { type: "string" },
        keyFeatures: { type: "array", items: { type: "string" } },
        contactDetails: { type: "string" },
      },
      required: ["problem"],
    },
    timeoutMs: 8000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 2,
    idempotent: false,
    sensitivity: "INTERNAL",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "sendWhatsAppFollowup",
    name: "sendWhatsAppFollowup",
    description:
      "أرسل رسالة واتساب متابعة لرقم المتصل تحتوي رابطاً موثوقاً من النظام. لا تخترع رابطاً. لا تقل إنها أُرسلت قبل أن يؤكد النظام.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        linkType: { type: "string", enum: ["PRODUCT_PAGE", "STORE", "PURCHASE", "DEMO"] },
        note: { type: "string", description: "سطر تعريفي قصير قبل الرابط" },
      },
      required: ["productId", "linkType"],
    },
    timeoutMs: 10000,
    verificationLevel: "NO_VERIFICATION",
    requiresConfirmation: false,
    maxPerCall: 2,
    idempotent: true,
    sensitivity: "INTERNAL",
    allowedRoles: ALL_ROLES,
  },
  {
    id: "lookupCustomerRecord",
    name: "lookupCustomerRecord",
    description: "اطّلع على بيانات العميل الخاصة في نظامنا. تتطلب تحققاً من هوية المتصل.",
    parameters: {
      type: "object",
      properties: { field: { type: "string", enum: ["ORDER_STATUS", "SUBSCRIPTION", "CONTACT_PROFILE"] } },
      required: ["field"],
    },
    timeoutMs: 6000,
    verificationLevel: "OTP_REQUIRED",
    requiresConfirmation: false,
    maxPerCall: 3,
    idempotent: true,
    sensitivity: "CUSTOMER_PRIVATE",
    allowedRoles: ALL_ROLES,
  },
];

export function findTool(id: string): VoiceToolDefinition | undefined {
  return VOICE_TOOLS.find((t) => t.id === id || t.name === id);
}
