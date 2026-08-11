"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Send, Plus } from "lucide-react";

export default function CampaignsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const router = useRouter();
  const [data, setData] = useState<any>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [leadCount, setLeadCount] = useState(0);
  const [form, setForm] = useState({ name: "", productId: "", city: "", targetBusinessType: "", salesContext: "", useAllEligible: true });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    apiGet(`/marketing/campaigns?organizationId=${orgId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (!authLoading && orgId) load(); else if (!authLoading) setLoading(false); }, [authLoading, orgId]);

  const openCreate = async () => {
    setForm({ name: "", productId: "", city: "", targetBusinessType: "", salesContext: "", useAllEligible: true });
    setError(null); setOpen(true);
    if (orgId) {
      apiGet(`/marketing/products?organizationId=${orgId}`).then((d) => setProducts(d || [])).catch(() => {});
      apiGet(`/marketing/leads?organizationId=${orgId}&status=DISCOVERED&limit=1`).then((d) => setLeadCount(d?.total ?? 0)).catch(() => {});
    }
  };

  const create = async () => {
    if (!orgId) return;
    setCreating(true); setError(null);
    try {
      // Enroll all discovered leads for the org (bounded server-side).
      const leadsRes = await apiGet(`/marketing/leads?organizationId=${orgId}&status=DISCOVERED&limit=100`);
      const leadIds = (leadsRes?.items || []).map((l: any) => l.id);
      if (leadIds.length === 0) { setError("لا يوجد عملاء محتملون بحالة (مكتشف). اكتشف أو استورد أولاً."); setCreating(false); return; }
      const res = await api.post(`/marketing/campaigns`, {
        organizationId: orgId, name: form.name, productId: form.productId,
        city: form.city || undefined, targetBusinessType: form.targetBusinessType || undefined,
        salesContext: form.salesContext || undefined, leadIds,
      });
      setOpen(false);
      router.push(`/app/marketing/campaigns/${res.data.data.id}`);
    } catch (e: any) {
      setError(typeof e?.response?.data?.message === "string" ? e.response.data.message : "تعذر إنشاء الحملة");
    } finally { setCreating(false); }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted">حملاتك التسويقية عبر واتساب</p>
        <Button className="gap-2" onClick={openCreate}><Plus className="w-4 h-4" /> حملة جديدة</Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted">جاري التحميل...</div>
      ) : data.items.length === 0 ? (
        <div className="bg-surface border rounded-lg p-16 text-center text-muted flex flex-col items-center">
          <Send className="w-12 h-12 text-faint mb-4" />
          <p className="font-medium text-content">لا توجد حملات</p>
          <p className="text-sm mt-1">أنشئ أول حملة بعد اكتشاف العملاء وإضافة برنامج.</p>
        </div>
      ) : (
        <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
          <table className="w-full text-sm text-right">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-muted">الحملة</th>
                <th className="px-6 py-3 font-medium text-muted">البرنامج</th>
                <th className="px-6 py-3 font-medium text-muted">الحالة</th>
                <th className="px-6 py-3 font-medium text-muted">المستقبلون</th>
                <th className="px-6 py-3 font-medium text-muted">أُرسلت</th>
                <th className="px-6 py-3 font-medium text-muted">ردود</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.items.map((c: any) => (
                <tr key={c.id} className="hover:bg-surface-2 cursor-pointer" onClick={() => router.push(`/app/marketing/campaigns/${c.id}`)}>
                  <td className="px-6 py-3 font-medium">
                    <Link href={`/app/marketing/campaigns/${c.id}`} className="hover:text-brand">{c.name}</Link>
                  </td>
                  <td className="px-6 py-3 text-muted">{c.product?.nameArabic || "—"}</td>
                  <td className="px-6 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-6 py-3 text-muted">{c.totalRecipients}</td>
                  <td className="px-6 py-3 text-muted">{c.sentCount}</td>
                  <td className="px-6 py-3 text-muted">{c.repliedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title="حملة جديدة">
        <div className="space-y-3">
          {error && <div className="bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400 text-sm p-2 rounded">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-muted mb-1">اسم الحملة *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">البرنامج *</label>
            <select className="w-full border rounded-lg p-2.5 text-sm" value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}>
              <option value="">اختر البرنامج</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.nameArabic}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">سياق بيعي (اختياري)</label>
            <textarea className="w-full border rounded-lg p-2 text-sm h-20" value={form.salesContext} onChange={(e) => setForm({ ...form, salesContext: e.target.value })} />
          </div>
          <p className="text-xs text-muted">سيتم إدراج العملاء المحتملين بحالة (مكتشف): {leadCount} عميل. تمر جميعهم بفحص الأهلية وعدم التواصل.</p>
        </div>
        <div className="flex gap-2 justify-end mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={create} disabled={creating || !form.name || !form.productId}>{creating ? "جاري الإنشاء..." : "إنشاء"}</Button>
        </div>
      </Modal>
    </div>
  );
}

