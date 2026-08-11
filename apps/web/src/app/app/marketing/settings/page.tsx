"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle } from "lucide-react";

export default function MarketingSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    apiGet(`/marketing/settings?organizationId=${orgId}`).then(setS).catch(() => {}).finally(() => setLoading(false));
  }, [authLoading, orgId]);

  const save = async (patch: any) => {
    if (!orgId) return;
    setSaving(true); setSaved(false);
    try {
      const res = await api.patch(`/marketing/settings`, { organizationId: orgId, ...patch });
      setS(res.data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (!s) return <div className="p-8 text-gray-500">تعذر تحميل الإعدادات.</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className={`border rounded-lg p-5 shadow-sm ${s.killSwitchEnabled ? "bg-red-50 border-red-200" : "bg-white"}`}>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${s.killSwitchEnabled ? "text-red-600" : "text-gray-400"}`} />
              إيقاف الإرسال التسويقي بالكامل
            </h3>
            <p className="text-sm text-gray-500 mt-1">يوقف كل الرسائل التسويقية فوراً. لا يؤثر على دعم العملاء العادي عبر واتساب.</p>
          </div>
          <button onClick={() => save({ killSwitchEnabled: !s.killSwitchEnabled })} disabled={saving}
            className={`relative w-12 h-6 rounded-full transition ${s.killSwitchEnabled ? "bg-red-600" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${s.killSwitchEnabled ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
      </div>

      <SettingsCard title="أرقام واتساب" desc="أرقام مخصصة للتجربة والتنبيهات">
        <LabeledInput label="رقم التجربة (أرسل تجربة إلى رقمي)" value={s.testPhoneNumber || ""} dir="ltr"
          onSave={(v) => save({ testPhoneNumber: v || null })} />
        <LabeledInput label="رقم تنبيهات الفرص الساخنة" value={s.ownerHotLeadPhone || ""} dir="ltr"
          onSave={(v) => save({ ownerHotLeadPhone: v || null })} />
      </SettingsCard>

      <SettingsCard title="حدود الحملات والتكلفة" desc="ضوابط الأمان ومنع الإنفاق المفرط">
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-800">الوضع الآمن (Canary)</p>
            <p className="text-xs text-gray-500">يحدّ عدد المستقبلين في كل حملة لأول تجارب مضبوطة</p>
          </div>
          <button onClick={() => save({ safeCampaignMode: !s.safeCampaignMode })} disabled={saving}
            className={`relative w-12 h-6 rounded-full transition ${s.safeCampaignMode ? "bg-green-600" : "bg-gray-300"}`}>
            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${s.safeCampaignMode ? "right-0.5" : "left-0.5"}`} />
          </button>
        </div>
        <NumField label="أقصى عملاء للحملة" value={s.maxLeadsPerCampaign} onSave={(v) => save({ maxLeadsPerCampaign: v })} />
        <NumField label="حد الوضع الآمن (Canary)" value={s.canaryMaxRecipients} onSave={(v) => save({ canaryMaxRecipients: v })} />
        <NumField label="تأخير بين الرسائل (ثانية)" value={s.sendDelaySeconds} onSave={(v) => save({ sendDelaySeconds: v })} />
      </SettingsCard>

      <SettingsCard title="مزوّد الاكتشاف" desc="مصدر بيانات العملاء المحتملين">
        <div className="flex items-center gap-3 py-2">
          <select className="border rounded-lg p-2 text-sm" value={s.discoveryProvider}
            onChange={(e) => save({ discoveryProvider: e.target.value })}>
            <option value="MOCK">تجريبي (Mock)</option>
            <option value="GOOGLE_PLACES">Google Places</option>
          </select>
        </div>
      </SettingsCard>

      <div className="text-xs text-gray-400">الحد الأقصى للخصم على مستوى المنصة: 5% (ثابت، غير قابل للتجاوز).</div>
      {saved && <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircle className="w-4 h-4" /> تم الحفظ</div>}
    </div>
  );
}

function SettingsCard({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm">
      <h3 className="font-bold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mb-3">{desc}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LabeledInput({ label, value, dir, onSave }: { label: string; value: string; dir?: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex gap-2">
        <Input dir={dir} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
      </div>
    </div>
  );
}

function NumField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-gray-700">{label}</label>
      <Input dir="ltr" type="number" className="w-28" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => Number(v) !== value && onSave(Number(v))} />
    </div>
  );
}
