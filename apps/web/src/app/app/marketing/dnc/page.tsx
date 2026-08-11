"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Ban, Plus, Trash2 } from "lucide-react";

export default function DncPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    apiGet(`/marketing/dnc?organizationId=${orgId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (!authLoading && orgId) load(); else if (!authLoading) setLoading(false); }, [authLoading, orgId]);

  const add = async () => {
    if (!orgId || !phone) return;
    setAdding(true); setError(null);
    try {
      await api.post(`/marketing/dnc`, { organizationId: orgId, phone, reason: reason || undefined });
      setPhone(""); setReason(""); load();
    } catch (e: any) {
      setError(e?.response?.data?.message === "INVALID_PHONE" ? "رقم غير صالح" : "تعذر الإضافة");
    } finally { setAdding(false); }
  };

  const remove = async (id: string) => {
    if (!orgId) return;
    if (!confirm("هل تريد إزالة هذا الرقم من قائمة عدم التواصل؟ سيصبح قابلاً للتسويق مجدداً.")) return;
    try { await api.delete(`/marketing/dnc/${id}?organizationId=${orgId}`); load(); } catch { /* ignore */ }
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="bg-surface border rounded-lg p-5 shadow-sm mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-muted mb-1">رقم الجوال</label>
            <Input dir="ltr" placeholder="05xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-muted mb-1">السبب (اختياري)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <Button className="gap-2" onClick={add} disabled={adding || !phone}><Plus className="w-4 h-4" /> إضافة</Button>
        </div>
        {error && <div className="bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400 text-sm p-2 rounded mt-3">{error}</div>}
      </div>

      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">جاري التحميل...</div>
        ) : data.items.length === 0 ? (
          <div className="p-16 text-center text-muted flex flex-col items-center">
            <Ban className="w-12 h-12 text-faint mb-4" />
            <p className="font-medium text-content">القائمة فارغة</p>
          </div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-muted">الرقم</th>
                <th className="px-6 py-3 font-medium text-muted">المصدر</th>
                <th className="px-6 py-3 font-medium text-muted">السبب</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((e: any) => (
                <tr key={e.id} className="hover:bg-surface-2">
                  <td className="px-6 py-3 text-muted" dir="ltr">{e.normalizedPhone}</td>
                  <td className="px-6 py-3 text-faint text-xs">{e.source}</td>
                  <td className="px-6 py-3 text-muted">{e.reason || "—"}</td>
                  <td className="px-6 py-3 text-left">
                    <button onClick={() => remove(e.id)} className="text-danger-500 hover:text-danger-600 dark:text-danger-400"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
