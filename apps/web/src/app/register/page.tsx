"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Bot, Eye, EyeOff, QrCode, BookOpen, Hand } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

/**
 * إنشاء حساب.
 *
 * Same two-panel shape as login, with the panel switched from "what the colours
 * mean" to "what happens after you sign up" — the three steps, in order, so the
 * commitment is legible before it is made. No trial length is promised here;
 * that is a billing fact, and this screen does not get to invent one.
 */
export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      const planId = new URLSearchParams(window.location.search).get("plan");
      window.location.href = planId ? `/subscribe?plan=${planId}` : "/app/inbox";
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "تعذّر إنشاء الحساب. جرّب مرة ثانية.");
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(0,520px)] bg-bg" dir="rtl">
      <aside className="hidden lg:flex flex-col justify-between bg-frame text-frame-text p-12">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded bg-qano-500 grid place-items-center">
            <Bot className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">QanoAI</span>
        </div>

        <div className="max-w-md">
          <p className="eyebrow text-frame-muted mb-4">بعد التسجيل</p>
          <h2 className="text-display font-semibold leading-snug">
            ثلاث خطوات،
            <br />
            وتسلّمه المناوبة.
          </h2>

          <ol className="mt-8 space-y-5">
            {[
              { n: "١", icon: QrCode, title: "اربط واتساب", body: "امسح رمز QR من جوال المنشأة. الرقم يبقى رقمك." },
              { n: "٢", icon: BookOpen, title: "درّبه على معلوماتك", body: "ارفع أسعارك وسياساتك. يجاوب من هذا فقط." },
              { n: "٣", icon: Hand, title: "حدّد متى يحوّل لك", body: "أي محادثة تنتقل لك بضغطة، والموظف الذكي يوقف عنها." },
            ].map((s) => (
              <li key={s.n} className="flex gap-4">
                <span className="num w-7 h-7 shrink-0 rounded-full bg-qano-500/15 text-frame-brand grid place-items-center text-label font-bold">
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className="text-label font-semibold flex items-center gap-2">
                    {s.title}
                    <s.icon className="w-3.5 h-3.5 text-frame-muted" />
                  </p>
                  <p className="text-micro text-frame-muted mt-0.5 leading-relaxed">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-micro text-frame-muted">منصة سعودية لدعم العملاء عبر واتساب والمكالمات.</p>
      </aside>

      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="w-8 h-8 rounded bg-brand grid place-items-center">
              <Bot className="w-[18px] h-[18px] text-brand-fg" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-content">QanoAI</span>
          </div>

          <h1 className="text-title font-semibold text-content">إنشاء حساب</h1>
          <p className="text-label text-muted mt-1 mb-8">دقيقة واحدة، وتصير لك لوحة مناوبة خاصة بمنشأتك.</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded border border-danger-500/30 bg-danger-50 dark:bg-danger-600/10 px-4 py-3 text-label text-danger-600 dark:text-danger-400"
              >
                {error}
              </div>
            )}

            <Field label="الاسم الكامل" htmlFor="name" required>
              <Input id="name" value={form.name} onChange={set("name")} required placeholder="محمد العلي" autoComplete="name" />
            </Field>

            <Field label="اسم المنشأة" htmlFor="org" required hint="يظهر لفريقك داخل النظام.">
              <Input id="org" value={form.organizationName} onChange={set("organizationName")} required placeholder="مؤسسة رواد التقنية" autoComplete="organization" />
            </Field>

            <Field label="البريد الإلكتروني" htmlFor="email" required>
              <Input id="email" type="email" value={form.email} onChange={set("email")} required placeholder="you@company.com" dir="ltr" className="text-start" autoComplete="email" />
            </Field>

            <Field label="كلمة المرور" htmlFor="password" required hint="٨ أحرف على الأقل.">
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={set("password")}
                  required
                  minLength={8}
                  placeholder="••••••••"
                  dir="ltr"
                  className="text-start pe-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute inset-y-0 end-0 px-3 grid place-items-center text-faint hover:text-content transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" size="lg" loading={loading} className="w-full">
              {loading ? "جارٍ إنشاء الحساب…" : "إنشاء الحساب"}
            </Button>
          </form>

          <p className="text-label text-muted text-center mt-8">
            عندك حساب؟{" "}
            <Link href="/login" className="text-brand font-medium hover:underline underline-offset-4">
              سجّل الدخول
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
