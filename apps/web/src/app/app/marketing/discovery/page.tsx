"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Info } from "lucide-react";

export default function DiscoveryPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [products, setProducts] = useState<any[]>([]);
  const [providerStatus, setProviderStatus] = useState<any>(null);
  const [form, setForm] = useState({ productId: "", businessType: "", city: "", requestedCount: 50 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !orgId) return;
    apiGet(`/marketing/products?organizationId=${orgId}`).then((d) => setProducts(d || [])).catch(() => {});
    apiGet(`/marketing/leads/provider-status?organizationId=${orgId}`).then(setProviderStatus).catch(() => {});
  }, [authLoading, orgId]);

  const run = async () => {
    if (!orgId) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await api.post(`/marketing/leads/discover`, {
        organizationId: orgId,
        productId: form.productId,
        businessType: form.businessType,
        city: form.city,
        requestedCount: Number(form.requestedCount),
      });
      setResult(res.data.data);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setError(msg === "DISCOVERY_PROVIDER_CONFIGURATION_REQUIRED"
        ? "مزوّد الاكتشاف يحتاج إعداداً (مفتاح Google Places). استخدم الوضع التجريبي من الإعدادات."
        : typeof msg === "string" ? msg : "تعذر تشغيل الاكتشاف");
    } finally { setRunning(false); }
  };

  const statusLabel: Record<string, string> = {
    LIVE_VERIFIED: "مفعّل ومتحقق", CONFIGURATION_REQUIRED: "يحتاج إعداد", TEST_ONLY: "وضع تجريبي", ERROR: "خطأ",
  };

  return (
    <div className="p-8 max-w-2xl">
      {providerStatus && (
        <div className="flex items-center gap-2 mb-4 text-sm bg-blue-50 text-blue-700 p-3 rounded-lg">
          <Info className="w-4 h-4" />
          المزوّد الحالي: {providerStatus.provider} — {statusLabel[providerStatus.status] || providerStatus.status}
        </div>
      )}
      <div className="bg-white border rounded-lg p-6 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">البرنامج</label>
          <select className="w-full border rounded-lg p-2.5 text-sm" value={form.productId}
            onChange={(e) => setForm({ ...form, productId: e.target.value })}>
            <option value="">اختر البرنامج</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.nameArabic}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">النشاط</label>
          <Input placeholder="مثال: مكاتب محاماة" value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">المدينة</label>
          <Input placeholder="مثال: الرياض" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">العدد المطلوب</label>
          <Input type="number" dir="ltr" value={form.requestedCount} onChange={(e) => setForm({ ...form, requestedCount: Number(e.target.value) })} />
        </div>
        {error && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>}
        <Button className="gap-2 w-full" onClick={run}
          disabled={running || !form.productId || !form.businessType || !form.city}>
          <Search className="w-4 h-4" /> {running ? "جاري الاكتشاف..." : "اكتشف العملاء"}
        </Button>
      </div>

      {result && (
        <div className="bg-white border rounded-lg p-6 shadow-sm mt-4">
          <h3 className="font-bold text-gray-900 mb-3">نتيجة الاكتشاف</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
            <Stat label="تم العثور" value={result.found} />
            <Stat label="أُضيف" value={result.created} color="text-green-600" />
            <Stat label="مكرر" value={result.duplicates} />
            <Stat label="عدم تواصل" value={result.dnc} color="text-red-600" />
            <Stat label="رقم غير صالح" value={result.invalidPhone} />
          </div>
          <p className="text-xs text-gray-400 mt-3">المزوّد: {result.provider} — الحالة: {statusLabel[result.providerStatus] || result.providerStatus}</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-3 bg-gray-50 rounded-lg">
      <p className={`text-2xl font-bold ${color || "text-gray-900"}`}>{value ?? 0}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  );
}
