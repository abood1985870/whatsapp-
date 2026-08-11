"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard, Package, Search, Upload, Users, Send, Ban, BarChart3, Settings,
} from "lucide-react";

const tabs = [
  { href: "/app/marketing", label: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { href: "/app/marketing/products", label: "البرامج", icon: Package },
  { href: "/app/marketing/discovery", label: "اكتشاف العملاء", icon: Search },
  { href: "/app/marketing/import", label: "استيراد العملاء", icon: Upload },
  { href: "/app/marketing/leads", label: "العملاء المحتملون", icon: Users },
  { href: "/app/marketing/campaigns", label: "الحملات", icon: Send },
  { href: "/app/marketing/dnc", label: "عدم التواصل", icon: Ban },
  { href: "/app/marketing/analytics", label: "التحليلات", icon: BarChart3 },
  { href: "/app/marketing/settings", label: "الإعدادات", icon: Settings },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();

  return (
    <div dir="rtl">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="px-8 pt-6 pb-0">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">التسويق والمبيعات بالذكاء الاصطناعي</h1>
          <p className="text-gray-500 text-sm mb-4">اكتشف العملاء، خصّص الرسائل، وأدر حملاتك عبر واتساب</p>
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
