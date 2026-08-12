"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Bot, Hand, UserRound, PhoneCall, MessageCircle, BookOpen, Megaphone,
  BarChart3, ShieldCheck, ArrowLeft, Check, QrCode, Sparkles, Menu, X,
} from "lucide-react";
import { cn } from "@/components/ui/button";

/**
 * صفحة الهبوط.
 *
 * The page sells the one idea the product is actually built on — لوحة المناوبة:
 * every piece of work carries a rail that says who is holding it right now.
 * The hero shows the real interface language rather than a stock illustration,
 * and no number, logo or testimonial appears anywhere that we cannot stand
 * behind — an unlaunched product does not get to claim customers.
 */

const DUTY_ROWS = [
  { rail: "bg-qano-500", icon: Bot, name: "نورة العتيبي", line: "كم سعر الباقة الشهرية؟", state: "يتولّاها الموظف الذكي", tone: "auto" },
  { rail: "bg-alert-400", icon: Hand, name: "+966 55 204 8817", line: "أبي أكلم أحد من الفريق", state: "بانتظارك", tone: "alert" },
  { rail: "bg-qano-500", icon: Bot, name: "مؤسسة رواد التقنية", line: "وش الفرق بين الباقتين؟", state: "يتولّاها الموظف الذكي", tone: "auto" },
  { rail: "bg-ink-500", icon: UserRound, name: "خالد الدوسري", line: "طلبي رقم ٤٤٢١ متأخر", state: "يتولّاها موظف", tone: "human" },
] as const;

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "#idea", label: "الفكرة" },
    { href: "#employees", label: "الموظفون" },
    { href: "#how", label: "كيف يشتغل" },
    { href: "#control", label: "التحكّم" },
  ];

  return (
    <div className="min-h-screen bg-bg" dir="rtl">
      {/* ===== الشريط العلوي ===== */}
      <nav className="sticky top-0 z-50 bg-frame/95 backdrop-blur border-b border-frame-line text-frame-text">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-8 h-8 rounded bg-qano-500 grid place-items-center">
              <Bot className="w-[18px] h-[18px] text-white" />
            </span>
            <span className="text-[16px] font-semibold tracking-tight">QanoAI</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3 py-2 text-label text-frame-muted hover:text-frame-text rounded hover:bg-white/5 transition-colors"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="hidden sm:inline-flex h-9 items-center px-3 text-label text-frame-muted hover:text-frame-text rounded hover:bg-white/5 transition-colors"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center px-4 rounded bg-qano-500 text-white text-label font-medium hover:bg-qano-400 transition-colors"
            >
              ابدأ الآن
            </Link>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="القائمة"
              className="md:hidden grid place-items-center w-9 h-9 rounded text-frame-muted hover:text-frame-text hover:bg-white/5"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-frame-line px-5 py-3 space-y-0.5">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-2 text-label text-frame-muted hover:text-frame-text rounded hover:bg-white/5"
              >
                {l.label}
              </a>
            ))}
            <Link href="/login" className="block px-3 py-2 text-label text-frame-muted hover:text-frame-text rounded hover:bg-white/5">
              تسجيل الدخول
            </Link>
          </div>
        )}
      </nav>

      {/* ===== البطل ===== */}
      <section className="relative bg-frame text-frame-text overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 10%, rgb(var(--qano-400)) 0%, transparent 45%), radial-gradient(circle at 15% 85%, rgb(var(--qano-600)) 0%, transparent 40%)",
          }}
          aria-hidden
        />
        <div className="relative max-w-6xl mx-auto px-5 pt-16 pb-20 lg:pt-24 lg:pb-28 grid lg:grid-cols-2 gap-14 items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-frame-line bg-white/5 px-3 py-1 text-micro text-frame-muted">
              <Sparkles className="w-3.5 h-3.5 text-frame-brand" />
              موظفون يعملون بالذكاء الاصطناعي — بالعربية السعودية
            </span>

            <h1 className="mt-6 text-[34px] sm:text-[44px] lg:text-[52px] font-bold leading-[1.15] tracking-tight">
              وظّف موظف دعم
              <br />
              ما ينام ولا يتأخر
              <br />
              <span className="text-qano-400">على عميل.</span>
            </h1>

            <p className="mt-6 text-[17px] leading-relaxed text-frame-muted max-w-lg">
              QanoAI يستقبل رسائل واتساب ومكالمات عملائك، يجاوب من معلومات
              منشأتك أنت، ويحوّل لك المحادثة أول ما تحتاج إنسان — وأنت تشوف كل
              شي في لوحة وحدة.
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 px-7 rounded bg-qano-500 text-white font-semibold hover:bg-qano-400 transition-colors"
              >
                ابدأ الآن
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <a
                href="#idea"
                className="inline-flex h-12 items-center justify-center px-7 rounded border border-frame-line text-frame-text font-medium hover:bg-white/5 transition-colors"
              >
                شوف كيف يشتغل
              </a>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {["يربط برقم واتساب منشأتك", "يجاوب من قاعدة معرفتك", "يحوّل لموظف بشري في أي لحظة"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-label text-frame-muted">
                  <Check className="w-4 h-4 text-qano-400 shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          {/* لقطة من الواجهة الفعلية — نفس لغة الألوان */}
          <div className="relative">
            <div className="rounded-lg border border-frame-line bg-frame-2 shadow-pop overflow-hidden">
              <div className="flex items-center justify-between px-4 h-11 border-b border-frame-line">
                <span className="text-label font-medium">صندوق الوارد</span>
                <span className="flex items-center gap-1.5 text-micro text-frame-muted">
                  <span className="w-1.5 h-1.5 rounded-full bg-qano-400" />
                  مباشر
                </span>
              </div>

              <div className="flex items-center gap-1 px-3 h-9 border-b border-frame-line">
                {[
                  { label: "الكل", n: 4, hot: false },
                  { label: "بانتظارك", n: 1, hot: true },
                  { label: "آلي", n: 2, hot: false },
                ].map((t, i) => (
                  <span
                    key={t.label}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded text-micro",
                      i === 0 ? "bg-white/[0.07] text-frame-text" : "text-frame-muted"
                    )}
                  >
                    {t.label}
                    <span
                      className={cn(
                        "num px-1 rounded-sm",
                        t.hot ? "bg-alert-400 text-ink-950 font-semibold" : "bg-white/10"
                      )}
                    >
                      {t.n}
                    </span>
                  </span>
                ))}
              </div>

              <ul className="divide-y divide-frame-line">
                {DUTY_ROWS.map((row) => (
                  <li key={row.name} className="relative flex items-start gap-3 py-3.5 pe-4 ps-4">
                    <span className={cn("absolute inset-y-0 start-0 w-[3px]", row.rail)} aria-hidden />
                    <span
                      className={cn(
                        "w-8 h-8 rounded-full grid place-items-center shrink-0",
                        row.tone === "auto" ? "bg-qano-500/15 text-qano-400" : "bg-white/5 text-frame-muted"
                      )}
                    >
                      <row.icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-label font-medium truncate", row.name.startsWith("+") && "num")}>
                        {row.name}
                      </p>
                      <p className="text-micro text-frame-muted truncate">{row.line}</p>
                    </div>
                    <span
                      className={cn(
                        "text-micro shrink-0 mt-0.5",
                        row.tone === "alert" ? "text-alert-300 font-medium" : "text-frame-muted"
                      )}
                    >
                      {row.state}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-3 text-micro text-frame-muted text-center">
              الشريط على حافة كل صف يقول من يتولّاها — بدون ما تفتحها.
            </p>
          </div>
        </div>
      </section>

      {/* ===== الفكرة ===== */}
      <section id="idea" className="max-w-6xl mx-auto px-5 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">لوحة المناوبة</p>
          <h2 className="text-[30px] lg:text-[36px] font-bold leading-tight text-content tracking-tight">
            أهم سؤال في الدعم:
            <br />
            من ماسك هالمحادثة الحين؟
          </h2>
          <p className="mt-4 text-[17px] text-muted leading-relaxed">
            في QanoAI اللون له معنى واحد فقط: <strong className="text-content font-semibold">الآلة داخلة على الخط</strong>.
            اللي ماسكه إنسان ما له لون — عشان عينك تلقط بسرعة اللي يحتاجك أنت.
          </p>
        </div>

        <div className="mt-10 grid sm:grid-cols-3 gap-4">
          {[
            { icon: Bot, rail: "bg-qano-500", chip: "bg-qano-50 text-qano-700 dark:bg-qano-900 dark:text-qano-300", title: "يتولّاها الموظف الذكي", body: "يجاوب من معلوماتك، ويسجّل كل شي. ما تحتاج تتدخل." },
            { icon: Hand, rail: "bg-alert-400", chip: "bg-alert-50 text-alert-700 dark:bg-alert-700/25 dark:text-alert-300", title: "بانتظارك", body: "العميل طلب إنسان، أو الموظف الذكي وقف. هذي اللي تفتحها أول." },
            { icon: UserRound, rail: "bg-ink-300 dark:bg-ink-600", chip: "bg-surface-2 text-muted border border-line", title: "يتولّاها موظف", body: "أحد من فريقك ماسكها. بدون لون — لأنها مو مشكلتك." },
          ].map((c) => (
            <div key={c.title} className="relative rounded-lg border border-line bg-surface p-5 overflow-hidden">
              <span className={cn("absolute inset-y-0 start-0 w-[3px]", c.rail)} aria-hidden />
              <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-micro font-semibold", c.chip)}>
                <c.icon className="w-3 h-3" />
                {c.title}
              </span>
              <p className="mt-3 text-label text-muted leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== الموظفون ===== */}
      <section id="employees" className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-20 lg:py-24">
          <div className="max-w-2xl">
            <p className="eyebrow mb-3">الموظفون</p>
            <h2 className="text-[30px] lg:text-[36px] font-bold leading-tight text-content tracking-tight">
              مو أداة. موظفون تشغّلهم وقت ما تحتاج.
            </h2>
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {[
              {
                icon: MessageCircle,
                title: "الموظف الذكي",
                sub: "واتساب",
                body: "يستقبل رسائل عملائك على رقم منشأتك، يفهم السؤال بالعربي واللهجة، ويرد من قاعدة معرفتك أنت.",
                points: ["ربط بالـ QR في دقائق", "رد تلقائي أو نصف تلقائي", "تحويل فوري لموظف بشري"],
              },
              {
                icon: PhoneCall,
                title: "الموظف الصوتي",
                sub: "مكالمات",
                body: "يرد على المكالمات بصوت طبيعي، يفهم طلب العميل، ويسلّم المكالمة لموظف إذا احتاجت.",
                points: ["محادثة صوتية لحظية", "تفريغ نصّي لكل مكالمة", "يعمل على رقم تحدّده أنت"],
              },
              {
                icon: Megaphone,
                title: "موظف المبيعات",
                sub: "تسويق",
                body: "يتابع العملاء المهتمين، يرسل حملات موجّهة، ويشتغل داخل حدود أسعار وخصومات تحددها أنت.",
                points: ["حملات على واتساب", "متابعة الفرص أول بأول", "سقف خصم لا يتجاوزه"],
              },
            ].map((e) => (
              <div key={e.title} className="rounded-lg border border-line bg-bg p-6 flex flex-col">
                <span className="w-10 h-10 rounded bg-qano-50 dark:bg-qano-900 grid place-items-center">
                  <e.icon className="w-5 h-5 text-qano-600 dark:text-qano-300" />
                </span>
                <div className="mt-4 flex items-baseline gap-2">
                  <h3 className="text-[18px] font-semibold text-content">{e.title}</h3>
                  <span className="text-micro text-faint">{e.sub}</span>
                </div>
                <p className="mt-2 text-label text-muted leading-relaxed">{e.body}</p>
                <ul className="mt-4 space-y-2 pt-4 border-t border-line">
                  {e.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-label text-muted">
                      <Check className="w-4 h-4 text-qano-600 dark:text-qano-400 shrink-0 mt-0.5" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== كيف يشتغل ===== */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-20 lg:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">البداية</p>
          <h2 className="text-[30px] lg:text-[36px] font-bold leading-tight text-content tracking-tight">
            ثلاث خطوات، وتسلّمه المناوبة.
          </h2>
        </div>

        <ol className="mt-10 grid md:grid-cols-3 gap-6">
          {[
            { n: "١", icon: QrCode, title: "اربط واتساب", body: "امسح رمز QR من جوال المنشأة. الرقم يبقى رقمك، والمحادثات تبقى عندك." },
            { n: "٢", icon: BookOpen, title: "درّبه على معلوماتك", body: "ارفع أسعارك وسياساتك وأسئلتك المتكررة. يجاوب من هذا فقط — ما يخترع." },
            { n: "٣", icon: Bot, title: "شغّله وراقب", body: "حدّد متى يرد لحاله ومتى يحوّل لك. كل محادثة تبقى مسجّلة وتقدر تتدخل بأي لحظة." },
          ].map((s) => (
            <li key={s.n} className="relative">
              <div className="flex items-center gap-3">
                <span className="num w-8 h-8 rounded-full bg-brand text-brand-fg grid place-items-center text-label font-bold shrink-0">
                  {s.n}
                </span>
                <s.icon className="w-4 h-4 text-faint" />
              </div>
              <h3 className="mt-4 text-[17px] font-semibold text-content">{s.title}</h3>
              <p className="mt-1.5 text-label text-muted leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== التحكّم ===== */}
      <section id="control" className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-5 py-20 lg:py-24 grid lg:grid-cols-[1fr_1.1fr] gap-12 items-start">
          <div>
            <p className="eyebrow mb-3">التحكّم</p>
            <h2 className="text-[30px] lg:text-[36px] font-bold leading-tight text-content tracking-tight">
              الموظف الذكي يشتغل داخل حدودك.
            </h2>
            <p className="mt-4 text-[17px] text-muted leading-relaxed">
              تسليم الدعم لآلة قرار كبير. عشان كذا كل شي هنا مبني على إنك تقدر
              توقفه، تراجعه، وتاخذ مكانه في أي لحظة.
            </p>
            <Link
              href="/register"
              className="mt-7 inline-flex h-11 items-center gap-2 px-6 rounded bg-brand text-brand-fg font-semibold hover:bg-qano-700 dark:hover:bg-qano-300 transition-colors"
            >
              ابدأ الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { icon: ShieldCheck, title: "صلاحيات لكل موظف", body: "تحدد مين يشوف المحادثات، مين يرسل، ومين يغيّر الإعدادات." },
              { icon: Hand, title: "التحويل للإنسان", body: "أي محادثة تنتقل لموظف بضغطة — والموظف الذكي يوقف فوراً عنها." },
              { icon: BookOpen, title: "يجاوب من مصادرك", body: "الردود تُبنى على المحتوى اللي رفعته، ومربوطة بمصدرها." },
              { icon: BarChart3, title: "كل شي مسجّل", body: "كل رسالة ومكالمة وتحويل محفوظ ومربوط بوقته وصاحبه." },
            ].map((f) => (
              <div key={f.title} className="rounded-lg border border-line bg-bg p-5">
                <f.icon className="w-[18px] h-[18px] text-qano-600 dark:text-qano-400" />
                <h3 className="mt-3 text-label font-semibold text-content">{f.title}</h3>
                <p className="mt-1 text-label text-muted leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== الدعوة الأخيرة ===== */}
      <section className="bg-frame text-frame-text">
        <div className="max-w-6xl mx-auto px-5 py-20 text-center">
          <h2 className="text-[30px] lg:text-[38px] font-bold leading-tight tracking-tight">
            خلّ عميلك يلقى رد
            <span className="text-qano-400"> بنفس اللحظة.</span>
          </h2>
          <p className="mt-4 text-[17px] text-frame-muted max-w-xl mx-auto leading-relaxed">
            اربط رقم واتساب منشأتك وابدأ أول محادثة اليوم.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 px-8 rounded bg-qano-500 text-white font-semibold hover:bg-qano-400 transition-colors"
            >
              ابدأ الآن
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center px-8 rounded border border-frame-line font-medium hover:bg-white/5 transition-colors"
            >
              عندي حساب
            </Link>
          </div>
        </div>
      </section>

      {/* ===== التذييل ===== */}
      <footer className="bg-frame text-frame-muted border-t border-frame-line">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded bg-qano-500 grid place-items-center">
              <Bot className="w-4 h-4 text-white" />
            </span>
            <span className="text-label font-semibold text-frame-text">QanoAI</span>
          </div>
          <p className="text-micro">منصة سعودية لدعم العملاء عبر واتساب والمكالمات.</p>
          <p className="text-micro">
            <span className="num">© 2026</span> QanoAI — جميع الحقوق محفوظة.
          </p>
        </div>
      </footer>
    </div>
  );
}
