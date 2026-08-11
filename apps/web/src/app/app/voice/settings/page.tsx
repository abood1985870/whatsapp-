"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle } from "lucide-react";

export default function VoiceSettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!orgId) { setLoading(false); return; }
    apiGet(`/voice/settings?organizationId=${orgId}`).then(setS).catch(() => {}).finally(() => setLoading(false));
  }, [authLoading, orgId]);

  const save = async (patch: any) => {
    if (!orgId) return;
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await api.patch(`/voice/settings`, { organizationId: orgId, ...patch });
      setS(res.data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      const code = e?.response?.data?.message;
      setError(code === "RECORDING_STORAGE_NOT_CONFIGURED"
        ? "لا يمكن تفعيل التسجيل: تخزين الملفات غير مهيأ بعد. راجع دليل الإعداد الخارجي."
        : "تعذر الحفظ");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (!s) return <div className="p-8 text-gray-500">تعذر تحميل الإعدادات.</div>;

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div className={`border rounded-lg p-5 shadow-sm ${s.killSwitchEnabled ? "bg-red-50 border-red-200" : "bg-white"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className={`w-5 h-5 ${s.killSwitchEnabled ? "text-red-600" : "text-gray-400"}`} />
              إيقاف الموظف الصوتي بالكامل
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              يمنع بدء أي مكالمة ذكاء اصطناعي جديدة فوراً. لا يؤثر على واتساب أو دعم العملاء.
            </p>
          </div>
          <Toggle on={s.killSwitchEnabled} danger disabled={saving} onClick={() => save({ killSwitchEnabled: !s.killSwitchEnabled })} />
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}</div>}

      <Card title="الإجراءات والخصوصية" desc="ما يُسمح للموظف الصوتي بفعله">
        <Row label="تمكين الإجراءات (الأدوات)" desc="بدونها لن ينفذ أي عملية في النظام">
          <Toggle on={s.toolsEnabled} disabled={saving} onClick={() => save({ toolsEnabled: !s.toolsEnabled })} />
        </Row>
        <Row label="متابعة واتساب بعد المكالمة" desc="إرسال روابط موثوقة عند الحاجة فقط">
          <Toggle on={s.whatsappFollowupEnabled} disabled={saving} onClick={() => save({ whatsappFollowupEnabled: !s.whatsappFollowupEnabled })} />
        </Row>
        <Row label="تسجيل المكالمات" desc="معطّل افتراضياً؛ يتطلب تهيئة تخزين آمن وموافقة العميل">
          <Toggle on={s.recordingEnabled} disabled={saving} onClick={() => save({ recordingEnabled: !s.recordingEnabled })} />
        </Row>
        <Row label="التحقق برمز OTP" desc="مطلوب للاطلاع على بيانات العملاء الخاصة">
          <Toggle on={s.otpEnabled} disabled={saving} onClick={() => save({ otpEnabled: !s.otpEnabled })} />
        </Row>
        <Row label="السماح بشراء أرقام جديدة" desc="عملية مدفوعة؛ معطّلة افتراضياً">
          <Toggle on={s.numberProvisioningEnabled} disabled={saving} onClick={() => save({ numberProvisioningEnabled: !s.numberProvisioningEnabled })} />
        </Row>
      </Card>

      <Card title="حدود التشغيل" desc="حماية من المكالمات المنسية والتحميل الزائد">
        <NumField label="أقصى مكالمات متزامنة" value={s.maxConcurrentCalls} onSave={(v) => save({ maxConcurrentCalls: v })} />
        <NumField label="أقصى مدة للمكالمة (ثانية)" value={s.maxCallSeconds} onSave={(v) => save({ maxCallSeconds: v })} />
        <NumField label="تنبيه الصمت بعد (ثانية)" value={s.silenceWarningSeconds} onSave={(v) => save({ silenceWarningSeconds: v })} />
        <NumField label="إنهاء عند الصمت بعد (ثانية)" value={s.silenceEndSeconds} onSave={(v) => save({ silenceEndSeconds: v })} />
      </Card>

      <Card title="حدود التكلفة" desc="قاطع الإنفاق: يمنع بدء مكالمات جديدة عند تجاوز الحد، ولا يقطع مكالمة جارية">
        <NumField label="حد يومي (هللة)" value={s.dailyBudgetMinor ?? 0} onSave={(v) => save({ dailyBudgetMinor: v || null })} />
        <NumField label="حد شهري (هللة)" value={s.monthlyBudgetMinor ?? 0} onSave={(v) => save({ monthlyBudgetMinor: v || null })} />
      </Card>

      <Card title="أرقام التنبيه" desc="أرقام داخلية للفريق">
        <TextField label="رقم تنبيه الفرص الساخنة" value={s.ownerAlertPhone ?? ""} onSave={(v) => save({ ownerAlertPhone: v || null })} />
        <TextField label="رقم التجربة" value={s.testPhoneNumber ?? ""} onSave={(v) => save({ testPhoneNumber: v || null })} />
        <TextField label="ملاحظة أوقات العمل" value={s.businessHoursNote ?? ""} onSave={(v) => save({ businessHoursNote: v })} ltr={false} />
      </Card>

      <div className="text-xs text-gray-400">
        مرحلة الإصدار الحالية: {s.releaseStage} — الحد الأقصى للخصم على مستوى المنصة 5% (ثابت وغير قابل للتجاوز).
      </div>
      {saved && <div className="flex items-center gap-2 text-green-600 text-sm"><CheckCircle className="w-4 h-4" /> تم الحفظ</div>}
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-5 shadow-sm">
      <h3 className="font-bold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500 mb-3">{desc}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Row({ label, desc, children }: { label: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{desc}</p>
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onClick, disabled, danger }: { on: boolean; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`relative w-12 h-6 rounded-full transition shrink-0 disabled:opacity-50 ${
        on ? (danger ? "bg-red-600" : "bg-green-600") : "bg-gray-300"
      }`}>
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition ${on ? "right-0.5" : "left-0.5"}`} />
    </button>
  );
}

function NumField({ label, value, onSave }: { label: string; value: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return (
    <div className="flex items-center justify-between gap-4">
      <label className="text-sm text-gray-700">{label}</label>
      <Input dir="ltr" type="number" className="w-32" value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => Number(v) !== value && onSave(Number(v))} />
    </div>
  );
}

function TextField({ label, value, onSave, ltr = true }: { label: string; value: string; onSave: (v: string) => void; ltr?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <Input dir={ltr ? "ltr" : undefined} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />
    </div>
  );
}
