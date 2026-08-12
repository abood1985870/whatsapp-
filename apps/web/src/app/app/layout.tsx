"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { cn } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  Inbox, Users, BookOpen, Bot, BarChart3, MessageCircle,
  Settings, LogOut, ShieldCheck, Megaphone, PhoneCall, Menu, X, CreditCard, ClipboardList, Tag
} from "lucide-react";

/**
 * The frame.
 *
 * Dark in both themes — it is the duty board, and the board does not change
 * colour when the operator changes theme. Navigation is grouped by what the
 * work *is*, not by which team built the feature:
 *
 *   التشغيل — work arriving from customers right now
 *   الذكاء  — the employees doing that work, and what they know
 *   النمو   — work you initiate, and the numbers it produces
 *
 * The active item carries the same leading-edge rail as every work row in the
 * product, so the language is consistent from the sidebar down to a message.
 */

type NavItem = { href: string; label: string; icon: any };
type NavGroup = { title: string; items: NavItem[] };

function isPlatformOwner(user: any) {
  return (user?.memberships || []).some(
    (m: any) => m.status === "ACTIVE" && m.role?.name === "PLATFORM_SUPER_ADMIN"
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const platformOwner = isPlatformOwner(user);
  const orgId = user?.memberships?.[0]?.organizationId;
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Server decides entitlement; UI visibility is convenience only.
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    api
      .get(`/marketing/entitlements?organizationId=${orgId}`)
      .then((res) => { if (active) setMarketingEnabled(res.data?.data?.enabled === true); })
      .catch(() => { if (active) setMarketingEnabled(false); });
    api
      .get(`/voice/entitlements?organizationId=${orgId}`)
      .then((res) => { if (active) setVoiceEnabled(res.data?.data?.enabled === true); })
      .catch(() => { if (active) setVoiceEnabled(false); });
    return () => { active = false; };
  }, [orgId]);

  // Close the mobile drawer whenever navigation happens.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const groups: NavGroup[] = [
    {
      title: "التشغيل",
      items: [
        { href: "/app/inbox", label: "صندوق الوارد", icon: Inbox },
        { href: "/app/contacts", label: "جهات الاتصال", icon: Users },
        { href: "/app/whatsapp", label: "واتساب", icon: MessageCircle },
      ],
    },
    {
      title: "الذكاء",
      items: [
        { href: "/app/ai-agents", label: "الموظف الذكي", icon: Bot },
        { href: "/app/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
        ...(voiceEnabled ? [{ href: "/app/voice", label: "الموظف الصوتي", icon: PhoneCall }] : []),
      ],
    },
    {
      title: "النمو",
      items: [
        ...(marketingEnabled ? [{ href: "/app/marketing", label: "التسويق والمبيعات", icon: Megaphone }] : []),
        { href: "/app/analytics", label: "التحليلات", icon: BarChart3 },
        { href: "/app/subscription", label: "اشتراكي", icon: CreditCard },
      ],
    },
  ];

  const footerItems: NavItem[] = [
    ...(platformOwner
      ? [
          { href: "/app/platform", label: "مالك المنصة", icon: ShieldCheck },
          { href: "/app/subscriptions", label: "طلبات الاشتراك", icon: ClipboardList },
          { href: "/app/plans", label: "الباقات", icon: Tag },
        ]
      : []),
    { href: "/app/settings", label: "الإعدادات", icon: Settings },
  ];

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + "/");

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center gap-3 rounded ps-3 pe-3 py-2 text-label transition-colors",
          active
            ? "bg-white/[0.07] text-frame-text font-medium"
            : "text-frame-muted hover:text-frame-text hover:bg-white/[0.04]"
        )}
      >
        {active && (
          <span className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-frame-brand" aria-hidden />
        )}
        <Icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-frame-brand")} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  const sidebar = (
    <div className="flex flex-col h-full bg-frame text-frame-text">
      <div className="flex items-center gap-2.5 h-14 px-4 border-b border-frame-line shrink-0">
        <span className="w-7 h-7 rounded bg-qano-500 grid place-items-center shrink-0">
          <Bot className="w-4 h-4 text-white" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">QanoAI</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden ms-auto grid place-items-center w-8 h-8 rounded text-frame-muted hover:text-frame-text hover:bg-white/5"
          aria-label="إغلاق القائمة"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.title}>
              <p className="eyebrow text-frame-muted/70 px-3 mb-1.5">{group.title}</p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          )
        )}
      </nav>

      <div className="border-t border-frame-line p-3 space-y-0.5 shrink-0">
        {footerItems.map((item) => (
          <NavLink key={item.href} item={item} />
        ))}

        <div className="flex items-center gap-2.5 pt-3 mt-2 border-t border-frame-line">
          <span className="w-8 h-8 rounded-full bg-qano-500/15 text-frame-brand grid place-items-center text-label font-semibold shrink-0">
            {user?.name?.charAt(0) || "؟"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-label font-medium truncate leading-tight">{user?.name || "مستخدم"}</p>
            <p className="text-micro text-frame-muted truncate">{user?.email || ""}</p>
          </div>
          <ThemeToggle frame />
          <button
            onClick={logout}
            aria-label="تسجيل الخروج"
            title="تسجيل الخروج"
            className="grid place-items-center w-9 h-9 rounded text-frame-muted hover:text-danger-400 hover:bg-danger-500/10 transition-colors shrink-0"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg" dir="rtl">
      {/* شريط علوي للجوال */}
      <header className="lg:hidden sticky top-0 z-40 flex items-center gap-3 h-14 px-4 bg-frame text-frame-text border-b border-frame-line">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="فتح القائمة"
          className="grid place-items-center w-9 h-9 -ms-2 rounded text-frame-muted hover:text-frame-text hover:bg-white/5"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="w-7 h-7 rounded bg-qano-500 grid place-items-center">
          <Bot className="w-4 h-4 text-white" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">QanoAI</span>
      </header>

      {/* القائمة الجانبية — ثابتة على سطح المكتب.
          inset-inline-start: يمين في العربي، يسار تلقائياً لو تحوّلت الواجهة
          إلى الإنجليزية. ما فيه أي قيمة يمين/يسار ثابتة في الهيكل. */}
      <aside className="hidden lg:block fixed inset-y-0 start-0 w-[248px] z-50">{sidebar}</aside>

      {/* القائمة الجانبية — درج على الجوال */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-ink-950/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 start-0 w-[248px] shadow-pop animate-fade-up">{sidebar}</div>
        </div>
      )}

      <main className="lg:ms-[248px] min-h-screen">{children}</main>
    </div>
  );
}
