"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { apiGet } from "@/lib/marketing";
import { CALL_STATUS_AR, formatDuration, OUTCOME_AR } from "@/lib/voice";
import { Input } from "@/components/ui/input";
import { PhoneCall, Search } from "lucide-react";

export default function VoiceCallsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const router = useRouter();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [outcome, setOutcome] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    const t = setTimeout(() => {
      setLoading(true);
      apiGet(`/voice/calls?organizationId=${orgId}&search=${encodeURIComponent(search)}&outcome=${outcome}`)
        .then(setData).catch(() => {}).finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [authLoading, orgId, search, outcome]);

  return (
    <div className="p-8">
      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-surface-2 flex flex-wrap gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-faint" />
            <Input placeholder="ابحث برقم المتصل..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="border rounded-lg px-3 text-sm" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="">كل النتائج</option>
            {Object.entries(OUTCOME_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted">جاري التحميل...</div>
        ) : data.items.length === 0 ? (
          <div className="p-16 text-center text-muted flex flex-col items-center">
            <PhoneCall className="w-12 h-12 text-faint mb-4" />
            <p className="font-medium text-content">لا توجد مكالمات</p>
            <p className="text-sm mt-1">ستظهر المكالمات هنا فور استقبال أول اتصال.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium text-muted">المتصل</th>
                  <th className="px-6 py-3 font-medium text-muted">التاريخ</th>
                  <th className="px-6 py-3 font-medium text-muted">المدة</th>
                  <th className="px-6 py-3 font-medium text-muted">الحالة</th>
                  <th className="px-6 py-3 font-medium text-muted">النتيجة</th>
                  <th className="px-6 py-3 font-medium text-muted">الموظف</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((c: any) => (
                  <tr key={c.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => router.push(`/app/voice/calls/${c.id}`)}>
                    <td className="px-6 py-3 font-medium" dir="ltr">{c.fromNumber}</td>
                    <td className="px-6 py-3 text-muted">{new Date(c.startedAt).toLocaleString("ar-SA")}</td>
                    <td className="px-6 py-3 text-muted" dir="ltr">{formatDuration(c.durationSeconds)}</td>
                    <td className="px-6 py-3"><span className="text-xs bg-surface-2 px-2 py-0.5 rounded">{CALL_STATUS_AR[c.status] || c.status}</span></td>
                    <td className="px-6 py-3 text-muted">{c.salesOutcome ? OUTCOME_AR[c.salesOutcome] || c.salesOutcome : "—"}</td>
                    <td className="px-6 py-3 text-muted">{c.agent?.employeeName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 text-xs text-faint border-t">الإجمالي: {data.total}</div>
      </div>
    </div>
  );
}
