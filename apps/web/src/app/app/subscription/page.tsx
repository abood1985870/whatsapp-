"use client";
import { useEffect, useState } from "react";
import { CreditCard, Clock, ShieldAlert } from "lucide-react";
import api from "@/lib/api";

function UsageBar({ percent, level }: { percent: number; level: string }) {
  const color =
    level === "FULL" ? "bg-danger-500" : level === "CRITICAL" ? "bg-alert-500" : level === "WARNING" ? "bg-alert-400" : "bg-qano-500";
  return (
    <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

export default function MySubscriptionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/subscription/current").then((res) => setData(res.data?.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-muted">جارٍ التحميل…</div>;

  if (data?.status !== "ACTIVE") {
    return (
      <div className="p-8">
        <div className="bg-surface border rounded-lg p-8 text-center shadow-sm max-w-md mx-auto">
          {data?.status === "PENDING" ? (
            <>
              <Clock className="w-10 h-10 mx-auto text-qano-600 dark:text-qano-400 mb-3" />
              <h1 className="text-lg font-bold text-content mb-2">طلب اشتراكك قيد المراجعة</h1>
              <p className="text-muted">سيصلك إشعار فور اتخاذ قرار بخصوص طلبك.</p>
            </>
          ) : (
            <>
              <ShieldAlert className="w-10 h-10 mx-auto text-faint mb-3" />
              <h1 className="text-lg font-bold text-content mb-2">لا يوجد اشتراك فعّال</h1>
              <p className="text-muted mb-4">اختر باقة من صفحة الأسعار لإرسال طلب اشتراك.</p>
              <a href="/#pricing" className="text-brand font-medium hover:underline">شاهد الباقات</a>
            </>
          )}
        </div>
      </div>
    );
  }

  const { subscription, usage } = data;
  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-qano-700 dark:text-qano-300 font-medium mb-2">الاشتراك</p>
        <h1 className="text-2xl font-bold text-content">باقتك الحالية</h1>
      </div>

      <div className="bg-surface border rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 grid place-items-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-content">{subscription.planName}</p>
              <p className="text-sm text-muted num">{(subscription.priceAmount / 100).toLocaleString("ar-SA")} ريال / شهر</p>
            </div>
          </div>
          <span className="rounded-full bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 px-3 py-1 text-xs font-medium">فعّال</span>
        </div>

        {usage.included != null && (
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-content">الرسائل</p>
              <p className="text-sm text-muted num">
                {usage.used.toLocaleString("ar-SA")} / {usage.included.toLocaleString("ar-SA")}
              </p>
            </div>
            <UsageBar percent={usage.usagePercent} level={usage.warningLevel} />
            <p className="mt-1.5 text-xs text-muted num">{usage.remaining?.toLocaleString("ar-SA")} رسالة متبقية</p>
            {usage.warningLevel === "WARNING" && <p className="mt-2 text-xs text-alert-600 dark:text-alert-400">استخدمت 70% من رسائل باقتك.</p>}
            {usage.warningLevel === "CRITICAL" && <p className="mt-2 text-xs text-alert-600 dark:text-alert-400">اقتربت من استهلاك كامل الباقة.</p>}
            {usage.warningLevel === "FULL" && <p className="mt-2 text-xs text-danger-600 dark:text-danger-400">استهلكت كامل رسائل باقتك لهذه الفترة.</p>}
          </div>
        )}

        <div className="mt-6 pt-6 border-t grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted">بداية الفترة</p>
            <p className="text-content font-medium num">{new Date(subscription.currentPeriodStart).toLocaleDateString("ar-SA")}</p>
          </div>
          <div>
            <p className="text-muted">نهاية الفترة</p>
            <p className="text-content font-medium num">{new Date(subscription.currentPeriodEnd).toLocaleDateString("ar-SA")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
