"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { apiGet, LEAD_STATUS_AR } from "@/lib/marketing";
import { Input } from "@/components/ui/input";
import { Users, Search } from "lucide-react";

export default function LeadsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    const t = setTimeout(() => {
      setLoading(true);
      apiGet(`/marketing/leads?organizationId=${orgId}&search=${encodeURIComponent(search)}&status=${status}`)
        .then(setData).catch(() => {}).finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [authLoading, orgId, search, status]);

  return (
    <div className="p-8">
      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50/50 flex flex-wrap gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="ابحث بالاسم أو الرقم..." className="pr-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="border rounded-lg px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(LEAD_STATUS_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : data.items.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <Users className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-900">لا يوجد عملاء محتملون</p>
            <p className="text-sm mt-1">ابدأ بالاكتشاف أو الاستيراد.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium text-gray-500">المنشأة</th>
                  <th className="px-6 py-3 font-medium text-gray-500">الجوال</th>
                  <th className="px-6 py-3 font-medium text-gray-500">المدينة</th>
                  <th className="px-6 py-3 font-medium text-gray-500">الموقع</th>
                  <th className="px-6 py-3 font-medium text-gray-500">الحالة</th>
                  <th className="px-6 py-3 font-medium text-gray-500">المصدر</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 font-medium">{l.businessName}</td>
                    <td className="px-6 py-3 text-gray-600" dir="ltr">{l.rawPhone}</td>
                    <td className="px-6 py-3 text-gray-500">{l.city || "—"}</td>
                    <td className="px-6 py-3 text-gray-500" dir="ltr">{l.website ? <a href={l.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">رابط</a> : "—"}</td>
                    <td className="px-6 py-3"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{LEAD_STATUS_AR[l.status] || l.status}</span></td>
                    <td className="px-6 py-3 text-gray-400 text-xs">{l.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="p-3 text-xs text-gray-400 border-t">الإجمالي: {data.total}</div>
      </div>
    </div>
  );
}
