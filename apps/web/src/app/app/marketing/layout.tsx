"use client";
import { useAuth } from "@/hooks/useAuth";
import { SubNav, type SubNavTab } from "@/components/ui/subnav";
import { LoadingRows } from "@/components/ui/page";
import {
  LayoutDashboard, Package, Search, Upload, Users, Send, Ban, BarChart3, Settings,
} from "lucide-react";

const tabs: SubNavTab[] = [
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
  const { loading } = useAuth();

  return (
    <div dir="rtl">
      <SubNav
        title="التسويق والمبيعات"
        description="اكتشف العملاء، خصّص الرسائل، وأدر حملاتك على واتساب — داخل حدود الأسعار والخصومات اللي تحددها."
        tabs={tabs}
      />
      {loading ? (
        <div className="p-6 lg:p-8">
          <LoadingRows rows={4} />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
