"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Bot, Hand, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

/**
 * Login.
 *
 * Two panels: the form on a clean surface, and — on wide screens — the duty
 * board itself, dark, showing the one idea the product is built on. Someone
 * signing in for the first time learns the colour language before they have
 * an account to use it in.
 */
export default function LoginPage() {
  const { login, completeMfa } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Set when the account has two-factor enabled. Until the code is accepted the
  // user holds nothing but a five-minute token that can do only one thing.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const goToApp = (data: any) => {
    const isPlatformOwner = (data.memberships || []).some(
      (membership: any) =>
        membership.status === "ACTIVE" && membership.role?.name === "PLATFORM_SUPER_ADMIN"
    );
    const planId = new URLSearchParams(window.location.search).get("plan");
    window.location.href = isPlatformOwner ? "/app/platform" : planId ? `/subscribe?plan=${planId}` : "/app/inbox";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      if (data?.mfaRequired) {
        setMfaToken(data.mfaToken);
        return;
      }
      goToApp(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "تعذّر تسجيل الدخول. تأكد من البريد وكلمة المرور.");
    } finally {
      setLoading(false);
    }
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      goToApp(await completeMfa(mfaToken!, code.trim()));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "الرمز غير صحيح. جرّب الرمز الحالي من التطبيق.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_minmax(0,520px)] bg-bg" dir="rtl">
      {/* الجانب التعريفي — يظهر على الشاشات الواسعة فقط */}
      <aside className="hidden lg:flex flex-col justify-between bg-frame text-frame-text p-12">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded bg-qano-500 grid place-items-center">
            <Bot className="w-[18px] h-[18px] text-white" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">QanoAI</span>
        </div>

        <div className="max-w-md">
          <p className="eyebrow text-frame-muted mb-4">لوحة المناوبة</p>
          <h2 className="text-display font-semibold leading-snug">
            تعرف في لحظة
            <br />
            من يتولّى كل محادثة.
          </h2>
          <p className="text-label text-frame-muted mt-4 leading-relaxed">
            كل صف في النظام يحمل شريطاً على حافته يقول من المسؤول عنه الآن — بدون
            ما تفتحه.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              { icon: Bot, color: "bg-qano-500", text: "يتولّاها الموظف الذكي", note: "ما تحتاج تتدخّل" },
              { icon: Hand, color: "bg-alert-400", text: "بانتظارك", note: "تحتاج ردّ إنسان" },
              { icon: UserRound, color: "bg-ink-500", text: "يتولّاها موظف", note: "أحد من فريقك ماسكها" },
            ].map((row) => (
              <li
                key={row.text}
                className="relative flex items-center gap-3 rounded bg-frame-2 py-3 pe-4 ps-4 overflow-hidden"
              >
                <span className={`absolute inset-y-0 start-0 w-[3px] ${row.color}`} />
                <span className="w-7 h-7 rounded-sm bg-white/5 grid place-items-center shrink-0">
                  <row.icon className="w-4 h-4 text-frame-text" />
                </span>
                <span className="text-label font-medium">{row.text}</span>
                <span className="text-micro text-frame-muted ms-auto">{row.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-micro text-frame-muted">منصة سعودية لدعم العملاء عبر واتساب والمكالمات.</p>
      </aside>

      {/* النموذج */}
      <main className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <span className="w-8 h-8 rounded bg-brand grid place-items-center">
              <Bot className="w-[18px] h-[18px] text-brand-fg" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-content">QanoAI</span>
          </div>

          <h1 className="text-title font-semibold text-content">
            {mfaToken ? "التحقق بخطوتين" : "تسجيل الدخول"}
          </h1>
          <p className="text-label text-muted mt-1 mb-8">
            {mfaToken
              ? "افتح تطبيق المصادقة واكتب الرمز الظاهر الآن."
              : "ادخل إلى لوحة المناوبة الخاصة بمنشأتك."}
          </p>

          {mfaToken ? (
            <form onSubmit={handleMfa} className="space-y-5">
              {error && (
                <div
                  role="alert"
                  className="rounded border border-danger-500/30 bg-danger-50 dark:bg-danger-600/10 px-4 py-3 text-label text-danger-600 dark:text-danger-400"
                >
                  {error}
                </div>
              )}

              <Field label="رمز التحقق" htmlFor="code" required hint="٦ أرقام، يتغيّر كل ٣٠ ثانية.">
                <Input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  numeric
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  className="text-center tracking-[0.5em] text-[18px]"
                />
              </Field>

              <Button type="submit" size="lg" loading={loading} disabled={code.length !== 6} className="w-full">
                {loading ? "جارٍ التحقق…" : "تأكيد"}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMfaToken(null);
                  setCode("");
                  setError("");
                }}
                className="w-full text-label text-muted hover:text-content transition-colors"
              >
                رجوع
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div
                role="alert"
                className="rounded border border-danger-500/30 bg-danger-50 dark:bg-danger-600/10 px-4 py-3 text-label text-danger-600 dark:text-danger-400"
              >
                {error}
              </div>
            )}

            <Field label="البريد الإلكتروني" htmlFor="email" required>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="you@company.com"
                dir="ltr"
                className="text-start"
              />
            </Field>

            <Field label="كلمة المرور" htmlFor="password" required>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  dir="ltr"
                  className="text-start pe-10"
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
              {loading ? "جارٍ الدخول…" : "دخول"}
            </Button>
          </form>
          )}

          <p className="text-label text-muted text-center mt-8">
            ما عندك حساب؟{" "}
            <Link href="/register" className="text-brand font-medium hover:underline underline-offset-4">
              سجّل الآن
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
