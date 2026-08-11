"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, LEAD_STATUS_AR, RECIPIENT_STATUS_AR } from "@/lib/marketing";

export default function MarketingAnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    apiGet(`/marketing/analytics?organizationId=${orgId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [authLoading, orgId]);

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (!data) return <div className="p-8 text-gray-500">لا توجد بيانات.</div>;

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Big label="نسبة الرد" value={`${data.funnel?.replyRate ?? 0}%`} />
        <Big label="نسبة الاهتمام" value={`${data.funnel?.interestRate ?? 0}%`} />
        <Big label="نسبة التحويل" value={`${data.funnel?.conversionRate ?? 0}%`} />
        <Big label="مكسوب" value={data.funnel?.won ?? 0} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Panel title="حالات العملاء المحتملين" rows={data.leads?.byStatus} labels={LEAD_STATUS_AR} />
        <Panel title="حالات مستقبلي الحملات" rows={data.recipients} labels={RECIPIENT_STATUS_AR} />
      </div>

      {!data.deliveryMetrics?.deliveredAvailable && (
        <p className="text-xs text-gray-400">حالة التسليم/القراءة: {data.deliveryMetrics?.note || "غير متاح من مزود الاتصال الحالي"}</p>
      )}
    </div>
  );
}

function Big({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm text-center">
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Panel({ title, rows, labels }: { title: string; rows?: Record<string, number>; labels: Record<string, string> }) {
  const entries = Object.entries(rows || {}).filter(([, v]) => v > 0);
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm">
      <h3 className="font-bold text-gray-900 mb-3">{title}</h3>
      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">لا توجد بيانات بعد.</p>
      ) : (
        <div className="space-y-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm">
              <span className="text-gray-600">{labels[k] || k}</span>
              <span className="font-medium text-gray-900">{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
