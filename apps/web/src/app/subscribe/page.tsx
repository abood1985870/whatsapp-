"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Check, Clock, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

/**
 * The one page every "اطلب الاشتراك" button points to, signed in or not.
 * Not under /app (no dashboard shell needed) and not middleware-gated like
 * /login and /register are, so the ?plan= query string survives a redirect
 * through registration and back here.
 */
export default function SubscribePage() {
  const { user, loading: authLoading } = useAuth();
  const [planId, setPlanId] = useState<string | null>(null);
  const [plan, setPlan] = useState<any>(null);
  const [current, setCurrent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ contactName: "", contactCompany: "", contactEmail: "", contactPhone: "", notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setPlanId(new URLSearchParams(window.location.search).get("plan"));
  }, []);

  useEffect(() => {
    if (!planId) return;
    api.get("/plans").then((res) => {
      const found = (res.data?.data || []).find((p: any) => p.id === planId);
      setPlan(found ?? null);
    });
  }, [planId]);

  useEffect(() => {
    if (authLoading || !user) { setLoading(false); return; }
    setForm((f) => ({ ...f, contactName: user.name || "", contactEmail: user.email || "" }));
    api.get("/subscription/current").then((res) => setCurrent(res.data?.data)).finally(() => setLoading(false));
  }, [authLoading, user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/subscription-requests", { planId, ...form });
      setSubmitted(true);
    } catch (err: any) {
      const code = err?.response?.data?.error?.message;
      if (code === "ALREADY_SUBSCRIBED") setError("لديك اشتراك فعّال بالفعل.");
      else if (code === "REQUEST_ALREADY_PENDING") setError("لديك طلب اشتراك قيد المراجعة بالفعل.");
      else setError("تعذّر إرسال طلب الاشتراك. جرّب مرة ثانية.");
    } finally {
      setSubmitting(false);
    }
  };

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-bg grid place-items-center p-6" dir="rtl">
      <div className="w-full max-w-md">
        <Link href="/" className="flex items-center gap-2.5 justify-center mb-8">
          <span className="w-8 h-8 rounded bg-qano-500 grid place-items-center">
            <Bot className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-content">QanoAI</span>
        </Link>
        <div className="bg-surface border border-line rounded-lg shadow-pop p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );

  if (!planId || (planId && plan === null && !loading)) {
    return (
      <Shell>
        <p className="text-center text-muted">لم يتم العثور على هذه الباقة.</p>
        <Link href="/#pricing" className="mt-4 block text-center text-brand font-medium hover:underline">
          الرجوع للباقات
        </Link>
      </Shell>
    );
  }

  if (authLoading || loading || !plan) {
    return <Shell><p className="text-center text-muted">جارٍ التحميل…</p></Shell>;
  }

  // Signed out — send the visitor to register/login, carrying the plan id.
  if (!user) {
    return (
      <Shell>
        <p className="eyebrow mb-2">الباقة المختارة</p>
        <h1 className="text-title font-semibold text-content">{plan.name}</h1>
        <p className="text-label text-muted mt-1">{plan.tagline}</p>
        <p className="mt-4 text-[28px] font-bold text-content num">
          {(plan.priceAmount / 100).toLocaleString("ar-SA")} <span className="text-label font-normal text-muted">ريال / شهرياً</span>
        </p>
        <p className="mt-6 text-label text-muted">أنشئ حساباً أو سجّل الدخول لإكمال طلب الاشتراك.</p>
        <div className="mt-4 flex flex-col gap-3">
          <Link href={`/register?plan=${planId}`}>
            <Button size="lg" className="w-full">تسجيل حساب جديد</Button>
          </Link>
          <Link href={`/login?plan=${planId}`}>
            <Button size="lg" variant="outline" className="w-full">عندي حساب بالفعل</Button>
          </Link>
        </div>
      </Shell>
    );
  }

  // Already has an active subscription.
  if (current?.status === "ACTIVE") {
    return (
      <Shell>
        <ShieldCheck className="w-10 h-10 text-qano-600 dark:text-qano-400 mx-auto mb-3" />
        <p className="text-center text-content font-semibold">لديك اشتراك فعّال بالفعل — {current.subscription?.planName}.</p>
        <Link href="/app/inbox" className="mt-5 block">
          <Button size="lg" className="w-full">الذهاب إلى لوحة التحكم</Button>
        </Link>
      </Shell>
    );
  }

  // Already has a pending request.
  if (submitted || current?.status === "PENDING") {
    return (
      <Shell>
        <Clock className="w-10 h-10 text-qano-600 dark:text-qano-400 mx-auto mb-3" />
        <h1 className="text-title font-semibold text-content text-center">تم استلام طلب اشتراكك بنجاح</h1>
        <p className="text-label text-muted mt-2 text-center leading-relaxed">
          سيتم مراجعته قريباً من فريق المنصة، وسيصلك إشعار فور الموافقة.
        </p>
        <Link href="/app/inbox" className="mt-5 block">
          <Button size="lg" variant="outline" className="w-full">الذهاب إلى لوحة التحكم</Button>
        </Link>
      </Shell>
    );
  }

  // Signed in, no subscription, no pending request — the actual request form.
  return (
    <Shell>
      <p className="eyebrow mb-2">تأكيد طلب الاشتراك</p>
      <h1 className="text-title font-semibold text-content">{plan.name}</h1>
      <p className="mt-2 text-[24px] font-bold text-content num">
        {(plan.priceAmount / 100).toLocaleString("ar-SA")} <span className="text-label font-normal text-muted">ريال / شهرياً</span>
      </p>
      {plan.messagesIncluded && (
        <p className="text-label text-muted mt-1 num">{plan.messagesIncluded.toLocaleString("ar-SA")} رسالة شهرياً</p>
      )}
      <ul className="mt-4 space-y-1.5">
        {(plan.features || []).slice(0, 4).map((f: string) => (
          <li key={f} className="flex items-center gap-2 text-label text-muted">
            <Check className="w-3.5 h-3.5 text-qano-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="mt-6 space-y-4 pt-6 border-t border-line">
        {error && (
          <div role="alert" className="rounded border border-danger-500/30 bg-danger-50 dark:bg-danger-600/10 px-4 py-3 text-label text-danger-600 dark:text-danger-400">
            {error}
          </div>
        )}
        <Field label="اسم جهة الاتصال" htmlFor="contactName" required>
          <Input id="contactName" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} required />
        </Field>
        <Field label="اسم الشركة" htmlFor="contactCompany">
          <Input id="contactCompany" value={form.contactCompany} onChange={(e) => setForm({ ...form, contactCompany: e.target.value })} />
        </Field>
        <Field label="البريد الإلكتروني" htmlFor="contactEmail" required>
          <Input id="contactEmail" type="email" dir="ltr" className="text-start" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} required />
        </Field>
        <Field label="رقم الجوال" htmlFor="contactPhone">
          <Input id="contactPhone" dir="ltr" className="text-start" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} placeholder="05xxxxxxxx" />
        </Field>
        <Field label="ملاحظات (اختياري)" htmlFor="notes">
          <Input id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
        <Button type="submit" size="lg" loading={submitting} className="w-full">
          {submitting ? "جارٍ الإرسال…" : "اطلب الاشتراك"}
        </Button>
      </form>
    </Shell>
  );
}
