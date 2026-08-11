"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/marketing";
import { Package, Users, Send, Ban, Flame, FileCode, ArrowLeft } from "lucide-react";

export default function MarketingOverview() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    apiGet(`/marketing/analytics?organizationId=${orgId}`)
      .then(setData)
      .catch(() => setError("تعذر تحميل البيانات"))
      .finally(() => setLoading(false));
  }, [authLoading, orgId]);

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;

  const cards = [
    { label: "إجمالي العملاء المحتملين", value: data?.leads?.total ?? 0, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "تم الإرسال", value: data?.recipients?.SENT ?? 0, icon: Send, color: "text-green-600 bg-green-50" },
    { label: "ردود", value: data?.recipients?.REPLIED ?? 0, icon: Send, color: "text-indigo-600 bg-indigo-50" },
    { label: "فرص ساخنة", value: data?.hotLeads ?? 0, icon: Flame, color: "text-orange-600 bg-orange-50" },
    { label: "قائمة عدم التواصل", value: data?.dncCount ?? 0, icon: Ban, color: "text-red-600 bg-red-50" },
    { label: "طلبات برمجة خاصة", value: data?.customRequests ?? 0, icon: FileCode, color: "text-purple-600 bg-purple-50" },
  ];

  const quickLinks = [
    { href: "/app/marketing/products", label: "أضف برنامجاً", icon: Package },
    { href: "/app/marketing/discovery", label: "اكتشف عملاء جدد", icon: Users },
    { href: "/app/marketing/campaigns", label: "أنشئ حملة", icon: Send },
  ];

  return (
    <div className="p-8 space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border rounded-lg p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">{c.label}</p>
                  <p className="text-3xl font-bold text-gray-900">{c.value}</p>
                </div>
                <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${c.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-1">مسار التحويل</h2>
        <p className="text-sm text-gray-500 mb-4">أرقام حقيقية من قاعدة البيانات</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <FunnelStat label="نسبة الرد" value={`${data?.funnel?.replyRate ?? 0}%`} />
          <FunnelStat label="نسبة الاهتمام" value={`${data?.funnel?.interestRate ?? 0}%`} />
          <FunnelStat label="نسبة التحويل" value={`${data?.funnel?.conversionRate ?? 0}%`} />
          <FunnelStat label="مكسوب" value={data?.funnel?.won ?? 0} />
        </div>
        {!data?.deliveryMetrics?.deliveredAvailable && (
          <p className="text-xs text-gray-400 mt-4">
            حالة التسليم/القراءة: {data?.deliveryMetrics?.note || "غير متاح من مزود الاتصال الحالي"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {quickLinks.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.href} href={l.href}
              className="flex items-center gap-2 bg-charcoal-900 text-white px-4 py-2.5 rounded-lg text-sm hover:bg-charcoal-800 transition">
              <Icon className="w-4 h-4" />
              {l.label}
              <ArrowLeft className="w-4 h-4" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FunnelStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-4 bg-gray-50 rounded-lg">
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
