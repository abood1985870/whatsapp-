"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import {
  Inbox, Users, BookOpen, Bot, BarChart3, MessageCircle,
  Settings, LogOut, ChevronLeft, ShieldCheck, Megaphone
} from "lucide-react";

const navItems = [
  { href: "/app/inbox", label: "صندوق الوارد", icon: Inbox },
  { href: "/app/contacts", label: "جهات الاتصال", icon: Users },
  { href: "/app/whatsapp", label: "واتساب", icon: MessageCircle },
  { href: "/app/ai-agents", label: "الذكاء الاصطناعي", icon: Bot },
  { href: "/app/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
  { href: "/app/analytics", label: "التحليلات", icon: BarChart3 },
  { href: "/app/settings", label: "الإعدادات", icon: Settings },
];

function isPlatformOwner(user: any) {
  return (user?.memberships || []).some(
    (membership: any) => membership.status === "ACTIVE" && membership.role?.name === "PLATFORM_SUPER_ADMIN"
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const platformOwner = isPlatformOwner(user);
  const orgId = user?.memberships?.[0]?.organizationId;
  const [marketingEnabled, setMarketingEnabled] = useState(false);

  // Server decides entitlement; UI visibility is convenience only.
  useEffect(() => {
    if (!orgId) return;
    let active = true;
    api
      .get(`/marketing/entitlements?organizationId=${orgId}`)
      .then((res) => { if (active) setMarketingEnabled(res.data?.data?.enabled === true); })
      .catch(() => { if (active) setMarketingEnabled(false); });
    return () => { active = false; };
  }, [orgId]);

  const items = [
    ...(platformOwner ? [{ href: "/app/platform", label: "مالك المنصة", icon: ShieldCheck }] : []),
    ...navItems,
    ...(marketingEnabled ? [{ href: "/app/marketing", label: "التسويق والمبيعات", icon: Megaphone }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">
      <aside className="w-64 bg-charcoal-900 text-white flex flex-col fixed h-full right-0 top-0 z-50">
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-charcoal-900" />
            </div>
            <span className="font-bold text-lg">QanoAI</span>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  isActive ? "bg-gold-500 text-charcoal-900 font-medium" : "text-gray-400 hover:bg-white/5 hover:text-white"
                }`}>
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
                {isActive && <ChevronLeft className="w-4 h-4 mr-auto" />}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gold-500/20 rounded-full flex items-center justify-center text-gold-500 font-bold text-sm">
              {user?.name?.charAt(0) || "?"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || "مستخدم"}</p>
              <p className="text-xs text-gray-500 truncate">{user?.email || ""}</p>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center gap-2 text-red-400 hover:text-red-300 text-sm px-3 py-2 rounded-lg hover:bg-red-500/10 transition">
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <main className="flex-1 mr-64">
        {children}
      </main>
    </div>
  );
}
