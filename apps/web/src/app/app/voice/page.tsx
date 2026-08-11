"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/marketing";
import { formatDuration, HEALTH_AR, HEALTH_COLOR, OUTCOME_AR, PROVIDER_STATUS_AR } from "@/lib/voice";
import { PhoneCall, CheckCircle2, AlertTriangle, Headphones, ArrowLeft } from "lucide-react";

export default function VoiceOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [analytics, setAnalytics] = useState<any>(null);
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    Promise.all([
      apiGet(`/voice/analytics?organizationId=${orgId}`).catch(() => null),
      apiGet(`/voice/diagnostics?organizationId=${orgId}`).catch(() => null),
    ])
      .then(([a, d]) => { setAnalytics(a); setDiagnostics(d); })
      .catch(() => setError("تعذر تحميل البيانات"))
      .finally(() => setLoading(false));
  }, [authLoading, orgId]);

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  const notReady = (diagnostics?.components ?? []).filter((c: any) => c.status === "NOT_CONFIGURED" || c.status === "UNHEALTHY");

  return (
    <div className="p-8 space-y-8">
      {notReady.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-yellow-900 mb-1">الموظف الصوتي غير جاهز لاستقبال المكالمات بعد</p>
              <ul className="text-sm text-yellow-800 list-disc mr-5 space-y-0.5">
                {notReady.map((c: any) => (
                  <li key={c.name}>{c.name}{c.detail ? ` — ${c.detail}` : ""}</li>
                ))}
              </ul>
              <Link href="/app/voice/setup" className="inline-flex items-center gap-1 text-sm text-yellow-900 font-medium mt-2 hover:underline">
                افتح معالج الإعداد <ArrowLeft className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label="إجمالي المكالمات" value={analytics?.totals?.calls ?? 0} icon={PhoneCall} color="text-blue-600 bg-blue-50" />
        <Card label="تم الرد" value={analytics?.totals?.answered ?? 0} icon={CheckCircle2} color="text-green-600 bg-green-50" />
        <Card label="طلبات دعم" value={analytics?.totals?.supportRequests ?? 0} icon={Headphones} color="text-purple-600 bg-purple-50" />
        <Card label="فشل/انقطاع" value={analytics?.totals?.failed ?? 0} icon={AlertTriangle} color="text-red-600 bg-red-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">نتائج المكالمات</h2>
          <p className="text-sm text-gray-500 mb-4">من سجلات قاعدة البيانات الفعلية</p>
          {Object.keys(analytics?.byOutcome ?? {}).length === 0 ? (
            <p className="text-sm text-gray-400">لا توجد مكالمات مصنّفة بعد.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(analytics.byOutcome).map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-600">{OUTCOME_AR[k] || k}</span>
                  <span className="font-medium text-gray-900">{v as number}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-xl font-bold text-gray-900">{formatDuration(analytics?.duration?.averageSeconds ?? 0)}</p>
              <p className="text-xs text-gray-500">متوسط مدة المكالمة</p>
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900">{analytics?.activity?.whatsappFollowups ?? 0}</p>
              <p className="text-xs text-gray-500">متابعات واتساب</p>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-1">حالة النظام</h2>
          <p className="text-sm text-gray-500 mb-4">
            المزوّد: {diagnostics?.provider ?? "—"} — {PROVIDER_STATUS_AR[diagnostics?.providerStatus] ?? diagnostics?.providerStatus ?? "—"}
          </p>
          <div className="space-y-2">
            {(diagnostics?.components ?? []).map((c: any) => (
              <div key={c.name} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-700">{c.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded border ${HEALTH_COLOR[c.status] || "bg-gray-100"}`}>
                  {HEALTH_AR[c.status] || c.status}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">مكالمات نشطة الآن: {diagnostics?.activeCalls ?? 0}</p>
        </div>
      </div>

      {analytics && !analytics.cost?.actualAvailable && (
        <p className="text-xs text-gray-400">
          التكلفة الفعلية: {analytics.cost?.note || "غير متاح من مزود الاتصال الحالي"} — المعروض تقدير فقط.
        </p>
      )}
    </div>
  );
}

function Card({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
