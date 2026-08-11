import api from "./api";

export const SAR = (minor: number) => {
  const riyals = Math.floor((minor ?? 0) / 100);
  const halalas = (minor ?? 0) % 100;
  const formatted = riyals.toLocaleString("en-US");
  return halalas > 0 ? `${formatted}.${String(halalas).padStart(2, "0")} ريال` : `${formatted} ريال`;
};

export const RECIPIENT_STATUS_AR: Record<string, string> = {
  PENDING: "بالانتظار",
  READY: "جاهز",
  QUEUED: "في الطابور",
  SENDING: "يُرسل",
  SENT: "تم الإرسال",
  FAILED: "فشل",
  REPLIED: "ردّ",
  SKIPPED_DUPLICATE: "مكرر",
  SKIPPED_DNC: "عدم تواصل",
  SKIPPED_PREVIOUS_CONTACT: "سبق التواصل",
  CANCELLED: "ملغى",
};

export const CAMPAIGN_STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  PREPARING: "قيد التجهيز",
  READY: "جاهزة",
  RUNNING: "قيد التشغيل",
  PAUSED: "متوقفة مؤقتاً",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
  FAILED: "فشلت",
};

export const LEAD_STATUS_AR: Record<string, string> = {
  DISCOVERED: "مكتشف",
  ELIGIBLE: "مؤهل",
  CONTACTED: "تم التواصل",
  REPLIED: "ردّ",
  INTERESTED: "مهتم",
  HOT: "ساخن",
  READY_TO_BUY: "جاهز للشراء",
  HANDED_TO_SUPPORT: "محوّل للدعم",
  WON: "مكسوب",
  LOST: "خسارة",
  NOT_INTERESTED: "غير مهتم",
  DO_NOT_CONTACT: "عدم تواصل",
  CUSTOM_SOFTWARE_REQUEST: "طلب برمجة خاصة",
};

export function unwrap<T = any>(res: any): T {
  return res?.data?.data ?? res?.data;
}

export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await api.get(path);
  return unwrap<T>(res);
}
