export const CALL_STATUS_AR: Record<string, string> = {
  RINGING: "يرن",
  CONNECTING: "جاري الاتصال",
  AI_SESSION_STARTING: "تجهيز المساعد",
  ACTIVE: "نشطة",
  LISTENING: "يستمع",
  THINKING: "يفكر",
  SPEAKING: "يتحدث",
  TOOL_EXECUTION: "ينفذ عملية",
  VERIFYING: "تحقق",
  ENDING: "تنتهي",
  COMPLETED: "مكتملة",
  DISCONNECTED: "انقطعت",
  FAILED: "فشلت",
};

export const OUTCOME_AR: Record<string, string> = {
  COLD: "بارد",
  INTERESTED: "مهتم",
  HOT: "ساخن",
  READY_TO_BUY: "جاهز للشراء",
  SUPPORT_REQUIRED: "يحتاج دعم",
  CUSTOM_SOFTWARE_REQUEST: "طلب برمجة خاصة",
  NOT_INTERESTED: "غير مهتم",
  OTHER: "أخرى",
  UNKNOWN: "غير محدد",
};

export const NUMBER_STATUS_AR: Record<string, string> = {
  NOT_CONFIGURED: "غير مهيأ",
  PENDING_SETUP: "بانتظار الإعداد",
  VERIFYING: "جاري التحقق",
  READY: "جاهز",
  ERROR: "خطأ",
};

export const PROVIDER_STATUS_AR: Record<string, string> = {
  LIVE_VERIFIED: "مفعّل ومتحقق",
  CONFIGURED_UNVERIFIED: "مهيأ بدون تحقق",
  CONFIGURATION_REQUIRED: "يحتاج إعداد",
  TEST_ONLY: "وضع تجريبي",
  ERROR: "خطأ",
};

export const HEALTH_AR: Record<string, string> = {
  HEALTHY: "سليم",
  DEGRADED: "جزئي",
  NOT_CONFIGURED: "غير مهيأ",
  UNHEALTHY: "متعطل",
};

export const HEALTH_COLOR: Record<string, string> = {
  HEALTHY: "bg-green-50 text-green-700 border-green-200",
  DEGRADED: "bg-yellow-50 text-yellow-700 border-yellow-200",
  NOT_CONFIGURED: "bg-gray-100 text-gray-600 border-gray-200",
  UNHEALTHY: "bg-red-50 text-red-700 border-red-200",
};

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, "0")}`;
}
