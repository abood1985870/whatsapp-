"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/marketing";
import { Metric, Card, CardHeader, CardBody } from "@/components/ui/card";
import { Section, ErrorState, LoadingRows, EmptyState } from "@/components/ui/page";
import { Data } from "@/components/ui/data";
import { Button } from "@/components/ui/button";
import { Package, Users, Send, Ban, Flame, FileCode, ArrowLeft, Building2, MessageSquare } from "lucide-react";

/**
 * نظرة عامة على التسويق.
 *
 * Every number here comes from the analytics endpoint. Where the provider
 * cannot report a metric (delivery/read receipts on the current WhatsApp
 * connection), the page says so in place of the number rather than showing a
 * zero that reads as "nobody opened it".
 */
export default function MarketingOverview() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    apiGet(`/marketing/analytics?organizationId=${orgId}`)
      .then(setData)
      .catch((e: any) => setError(e?.response?.data?.error?.message || "تعذّر تحميل البيانات"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) {
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, orgId]);

  if (loading) return <div className="p-6 lg:p-8"><LoadingRows rows={4} /></div>;

  if (!orgId) {
    return (
      <div className="p-6 lg:p-8">
        <EmptyState
          icon={Building2}
          title="ما فيه منشأة مرتبطة بحسابك"
          description="تواصل مع مالك الحساب لإضافتك إلى المنشأة."
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8">
        <ErrorState message={error} onRetry={load} />
      </div>
    );
  }

  const metrics = [
    { label: "العملاء المحتملون", value: data?.leads?.total ?? 0, icon: Users, hint: "كل من دخل النظام" },
    { label: "رسائل مرسلة", value: data?.recipients?.SENT ?? 0, icon: Send, hint: "عبر الحملات" },
    { label: "ردّوا", value: data?.recipients?.REPLIED ?? 0, icon: MessageSquare, hint: "ردّ فعلي من العميل" },
    { label: "فرص ساخنة", value: data?.hotLeads ?? 0, icon: Flame, hint: "تستاهل متابعة اليوم" },
    { label: "قائمة عدم التواصل", value: data?.dncCount ?? 0, icon: Ban, hint: "لا تُراسَل نهائياً" },
    { label: "طلبات برمجة خاصة", value: data?.customRequests ?? 0, icon: FileCode },
  ];

  const funnel = [
    { label: "نسبة الرد", value: `${data?.funnel?.replyRate ?? 0}%` },
    { label: "نسبة الاهتمام", value: `${data?.funnel?.interestRate ?? 0}%` },
    { label: "نسبة التحويل", value: `${data?.funnel?.conversionRate ?? 0}%` },
    { label: "مكسوب", value: data?.funnel?.won ?? 0 },
  ];

  const quickLinks = [
    { href: "/app/marketing/products", label: "أضف برنامجاً", icon: Package },
    { href: "/app/marketing/discovery", label: "اكتشف عملاء جدد", icon: Users },
    { href: "/app/marketing/campaigns", label: "أنشئ حملة", icon: Send },
  ];

  return (
    <div className="p-6 lg:p-8">
      <Section title="الأرقام" description="محسوبة من قاعدة البيانات مباشرة.">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics.map((m) => (
            <Metric key={m.label} label={m.label} value={m.value} hint={m.hint} icon={m.icon} />
          ))}
        </div>
      </Section>

      <Section>
        <Card>
          <CardHeader title="مسار التحويل" subtitle="من أول رسالة إلى صفقة مكسوبة." />
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {funnel.map((f) => (
                <div key={f.label} className="rounded border border-line bg-surface-2 p-4 text-center">
                  <Data className="text-title font-semibold text-content">{f.value}</Data>
                  <p className="text-micro text-muted mt-1">{f.label}</p>
                </div>
              ))}
            </div>

            {!data?.deliveryMetrics?.deliveredAvailable && (
              <p className="text-micro text-faint mt-4 leading-relaxed">
                <strong className="text-muted font-medium">التسليم والقراءة غير متاحة:</strong>{" "}
                {data?.deliveryMetrics?.note ||
                  "مزود الاتصال الحالي ما يرجّع إشعارات تسليم أو قراءة، فما نقدر نعرضها."}
              </p>
            )}
          </CardBody>
        </Card>
      </Section>

      <Section title="ابدأ من هنا">
        <div className="flex flex-wrap gap-2">
          {quickLinks.map((l) => (
            <Link key={l.href} href={l.href}>
              <Button variant="secondary">
                <l.icon className="w-4 h-4" />
                {l.label}
                <ArrowLeft className="w-4 h-4 text-faint" />
              </Button>
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
}
