"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { LayoutDashboard, Bot, Hash, PhoneCall, Activity, Settings } from "lucide-react";

const tabs = [
  { href: "/app/voice", label: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { href: "/app/voice/setup", label: "الإعداد", icon: Bot },
  { href: "/app/voice/numbers", label: "الأرقام", icon: Hash },
  { href: "/app/voice/calls", label: "المكالمات", icon: PhoneCall },
  { href: "/app/voice/diagnostics", label: "التشخيص", icon: Activity },
  { href: "/app/voice/settings", label: "الإعدادات", icon: Settings },
];

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();

  return (
    <div dir="rtl">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-8 pt-6 pb-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">الموظف الصوتي بالذكاء الاصطناعي</h1>
          <p className="text-gray-500 text-sm mb-4">يرد على مكالمات عملائك، يجاوب على أسئلتهم، ويسجّل الفرص تلقائياً</p>
          <nav className="flex gap-1 overflow-x-auto -mb-px">
            {tabs.map((tab) => {
              const active = tab.exact ? pathname === tab.href : pathname?.startsWith(tab.href);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition ${
                    active
                      ? "border-gold-500 text-charcoal-900 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {loading ? <div className="p-8 text-gray-500">جاري التحميل...</div> : children}
    </div>
  );
}
