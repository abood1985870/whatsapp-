"use client";
import { useAuth } from "@/hooks/useAuth";
import { SubNav, type SubNavTab } from "@/components/ui/subnav";
import { LoadingRows } from "@/components/ui/page";
import { LayoutDashboard, Bot, Hash, PhoneCall, Activity, Settings } from "lucide-react";

const tabs: SubNavTab[] = [
  { href: "/app/voice", label: "نظرة عامة", icon: LayoutDashboard, exact: true },
  { href: "/app/voice/setup", label: "الإعداد", icon: Bot },
  { href: "/app/voice/numbers", label: "الأرقام", icon: Hash },
  { href: "/app/voice/calls", label: "المكالمات", icon: PhoneCall },
  { href: "/app/voice/diagnostics", label: "التشخيص", icon: Activity },
  { href: "/app/voice/settings", label: "الإعدادات", icon: Settings },
];

export default function VoiceLayout({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();

  return (
    <div dir="rtl">
      <SubNav
        title="الموظف الصوتي"
        description="يرد على مكالمات عملائك بصوت طبيعي، يجاوب على أسئلتهم، ويحوّل المكالمة لموظف بشري إذا احتاجت."
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
