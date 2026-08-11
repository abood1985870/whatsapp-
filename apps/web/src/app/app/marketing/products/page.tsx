"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet, SAR } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Package, Plus, Pencil } from "lucide-react";

const EMPTY = {
  nameArabic: "", nameEnglish: "", shortDescription: "", fullDescription: "",
  price: "", targetCustomer: "", maxDiscountPercent: 5,
  purchaseUrl: "", storeUrl: "", demoUrl: "", productPageUrl: "", websiteUrl: "",
  featuresText: "", benefitsText: "",
};

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!orgId) return;
    setLoading(true);
    apiGet(`/marketing/products?organizationId=${orgId}&includeInactive=true`)
      .then((d) => setProducts(d || []))
      .catch(() => setError("تعذر تحميل البرامج"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (!authLoading && orgId) load(); else if (!authLoading) setLoading(false); }, [authLoading, orgId]);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(null); setOpen(true); };
  const openEdit = (p: any) => {
    setForm({
      nameArabic: p.nameArabic, nameEnglish: p.nameEnglish || "", shortDescription: p.shortDescription || "",
      fullDescription: p.fullDescription || "", price: String((p.priceMinor ?? 0) / 100), targetCustomer: p.targetCustomer || "",
      maxDiscountPercent: p.maxDiscountPercent ?? 5, purchaseUrl: p.purchaseUrl || "", storeUrl: p.storeUrl || "",
      demoUrl: p.demoUrl || "", productPageUrl: p.productPageUrl || "", websiteUrl: p.websiteUrl || "",
      featuresText: (p.features || []).join("\n"), benefitsText: (p.benefits || []).join("\n"),
    });
    setEditId(p.id); setError(null); setOpen(true);
  };

  const save = async () => {
    if (!orgId) return;
    setSaving(true); setError(null);
    const priceMinor = Math.round(parseFloat(form.price || "0") * 100);
    const payload: any = {
      organizationId: orgId,
      nameArabic: form.nameArabic,
      nameEnglish: form.nameEnglish || undefined,
      shortDescription: form.shortDescription || undefined,
      fullDescription: form.fullDescription || undefined,
      priceMinor,
      targetCustomer: form.targetCustomer || undefined,
      maxDiscountPercent: Math.min(Number(form.maxDiscountPercent) || 0, 5),
      purchaseUrl: form.purchaseUrl || undefined,
      storeUrl: form.storeUrl || undefined,
      demoUrl: form.demoUrl || undefined,
      productPageUrl: form.productPageUrl || undefined,
      websiteUrl: form.websiteUrl || undefined,
      features: form.featuresText.split("\n").map((s: string) => s.trim()).filter(Boolean),
      benefits: form.benefitsText.split("\n").map((s: string) => s.trim()).filter(Boolean),
    };
    try {
      if (editId) await api.patch(`/marketing/products/${editId}?organizationId=${orgId}`, payload);
      else await api.post(`/marketing/products`, payload);
      setOpen(false); load();
    } catch (e: any) {
      setError(e?.response?.data?.message ? JSON.stringify(e.response.data.message) : "تعذر الحفظ. تأكد من الاسم والسعر.");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted">البرامج الجاهزة بأسعارها الثابتة المعتمدة</p>
        <Button className="gap-2" onClick={openCreate}><Plus className="w-4 h-4" /> برنامج جديد</Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted">جاري التحميل...</div>
      ) : products.length === 0 ? (
        <div className="bg-surface border rounded-lg p-16 text-center text-muted flex flex-col items-center">
          <Package className="w-12 h-12 text-faint mb-4" />
          <p className="font-medium text-content">لا توجد برامج بعد</p>
          <p className="text-sm mt-1">أضف أول برنامج لتبدأ حملاتك.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => (
            <div key={p.id} className="bg-surface border rounded-lg p-5 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-content">{p.nameArabic}</h3>
                <button onClick={() => openEdit(p)} className="text-faint hover:text-muted"><Pencil className="w-4 h-4" /></button>
              </div>
              <p className="text-sm text-muted mb-3 line-clamp-2 min-h-[2.5rem]">{p.shortDescription || "—"}</p>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-brand">{SAR(p.priceMinor)}</span>
                <div className="flex gap-2">
                  {!p.active && <span className="text-xs bg-surface-2 text-muted px-2 py-0.5 rounded">غير مفعّل</span>}
                  <span className="text-xs bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 px-2 py-0.5 rounded">خصم ≤ {p.maxDiscountPercent}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editId ? "تعديل البرنامج" : "برنامج جديد"}>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pl-1">
          {error && <div className="bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400 text-sm p-2 rounded">{error}</div>}
          <Field label="الاسم بالعربية *"><Input value={form.nameArabic} onChange={(e) => setForm({ ...form, nameArabic: e.target.value })} /></Field>
          <Field label="الاسم بالإنجليزية"><Input value={form.nameEnglish} onChange={(e) => setForm({ ...form, nameEnglish: e.target.value })} /></Field>
          <Field label="وصف مختصر"><Input value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="السعر (ريال) *"><Input type="number" dir="ltr" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
            <Field label="أقصى خصم % (≤5)"><Input type="number" dir="ltr" value={form.maxDiscountPercent} onChange={(e) => setForm({ ...form, maxDiscountPercent: e.target.value })} /></Field>
          </div>
          <Field label="العميل المستهدف"><Input value={form.targetCustomer} onChange={(e) => setForm({ ...form, targetCustomer: e.target.value })} /></Field>
          <Field label="المزايا (سطر لكل ميزة)"><textarea className="w-full border rounded-lg p-2 text-sm h-20" value={form.featuresText} onChange={(e) => setForm({ ...form, featuresText: e.target.value })} /></Field>
          <Field label="الفوائد (سطر لكل فائدة)"><textarea className="w-full border rounded-lg p-2 text-sm h-20" value={form.benefitsText} onChange={(e) => setForm({ ...form, benefitsText: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="رابط الشراء"><Input dir="ltr" value={form.purchaseUrl} onChange={(e) => setForm({ ...form, purchaseUrl: e.target.value })} /></Field>
            <Field label="رابط المتجر"><Input dir="ltr" value={form.storeUrl} onChange={(e) => setForm({ ...form, storeUrl: e.target.value })} /></Field>
            <Field label="رابط العرض التجريبي"><Input dir="ltr" value={form.demoUrl} onChange={(e) => setForm({ ...form, demoUrl: e.target.value })} /></Field>
            <Field label="صفحة البرنامج"><Input dir="ltr" value={form.productPageUrl} onChange={(e) => setForm({ ...form, productPageUrl: e.target.value })} /></Field>
          </div>
        </div>
        <div className="flex gap-2 justify-end mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving || !form.nameArabic || !form.price}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted mb-1">{label}</label>
      {children}
    </div>
  );
}
