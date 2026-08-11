"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { NUMBER_STATUS_AR } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, Info, Trash2 } from "lucide-react";

const CONNECTION_TYPES = [
  { id: "EXISTING_FORWARDING", label: "رقمي الحالي عبر تحويل المكالمات" },
  { id: "EXISTING_SIP", label: "رقمي الحالي عبر SIP Trunk" },
];

export default function VoiceNumbersPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [numbers, setNumbers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState("");
  const [connectionType, setConnectionType] = useState("EXISTING_FORWARDING");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    apiGet(`/voice/numbers?organizationId=${orgId}`)
      .then((d) => setNumbers(d || []))
      .catch(() => setError("تعذر تحميل الأرقام"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (!authLoading) load(); }, [authLoading, orgId]);

  const add = async () => {
    if (!orgId || !phone) return;
    setSaving(true); setError(null);
    try {
      await api.post(`/voice/numbers/existing`, { organizationId: orgId, phoneNumber: phone, connectionType });
      setPhone(""); load();
    } catch (e: any) {
      const code = e?.response?.data?.message;
      setError(code === "INVALID_PHONE" ? "رقم غير صالح" : code === "NUMBER_ALREADY_REGISTERED" ? "الرقم مسجّل مسبقاً" : "تعذر إضافة الرقم");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!orgId) return;
    if (!confirm("إزالة هذا الرقم؟ لن يستقبل مكالمات بعدها.")) return;
    try { await api.delete(`/voice/numbers/${id}?organizationId=${orgId}`); load(); } catch { /* ignore */ }
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium mb-1">عن الأرقام السعودية</p>
          <p>
            الأرقام السعودية (+966) لا تُشترى عبر واجهة المزوّد الدولي لجهة غير مرخّصة محلياً. الطريقة العملية هي استخدام
            رقمك الحالي عبر تحويل المكالمات أو ربطه بـ SIP Trunk. لن يظهر الرقم بحالة (جاهز) إلا بعد وصول أول مكالمة فعلية.
          </p>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-5 shadow-sm">
        <h2 className="font-bold text-gray-900 mb-3">إضافة رقم</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">رقم الجوال / الهاتف</label>
            <Input dir="ltr" placeholder="+966 5X XXX XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">طريقة الربط</label>
            <select className="w-full border rounded-lg p-2.5 text-sm" value={connectionType} onChange={(e) => setConnectionType(e.target.value)}>
              {CONNECTION_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>}
          <Button onClick={add} disabled={saving || !phone}>{saving ? "جاري الإضافة..." : "إضافة الرقم"}</Button>
        </div>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : numbers.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <Hash className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-900">لا توجد أرقام</p>
            <p className="text-sm mt-1">أضف رقمك الحالي لتبدأ استقبال المكالمات.</p>
          </div>
        ) : (
          <div className="divide-y">
            {numbers.map((n) => (
              <div key={n.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-medium text-gray-900" dir="ltr">{n.phoneNumber}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${
                        n.status === "READY" ? "bg-green-50 text-green-700 border-green-200"
                          : n.status === "ERROR" ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-yellow-50 text-yellow-700 border-yellow-200"
                      }`}>{NUMBER_STATUS_AR[n.status] || n.status}</span>
                    </div>
                    <p className="text-xs text-gray-500">المزوّد: {n.provider}</p>
                    {n.setupNotes && (
                      <pre className="text-xs text-gray-600 bg-gray-50 border rounded p-3 mt-2 whitespace-pre-wrap font-sans">{n.setupNotes}</pre>
                    )}
                  </div>
                  <button onClick={() => remove(n.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
