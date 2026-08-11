"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Check } from "lucide-react";

const VOICES = [
  { id: "alloy", label: "Alloy — محايد" },
  { id: "echo", label: "Echo — هادئ" },
  { id: "shimmer", label: "Shimmer — ودود" },
];
const STYLES = [
  { id: "CALM", label: "هادئ واستشاري" },
  { id: "BALANCED", label: "متوازن" },
  { id: "STRONG_SALES", label: "بيعي واثق" },
];

export default function VoiceSetupPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [agent, setAgent] = useState<any>(null);
  const [tools, setTools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "موظف المبيعات الصوتي",
    employeeName: "سعود",
    primaryLanguage: "ar",
    voiceId: "alloy",
    salesStyle: "BALANCED",
    greetingMessage: "حياك الله، معك سعود من QanoAI، كيف أقدر أخدمك؟",
    closingMessage: "شكراً لاتصالك، في أمان الله.",
    maxCallSeconds: 900,
    allowedTools: [] as string[],
  });

  const load = async () => {
    if (!orgId) { setLoading(false); return; }
    try {
      const [agents, toolList] = await Promise.all([
        apiGet(`/voice/agents?organizationId=${orgId}`),
        apiGet(`/voice/agents/tools?organizationId=${orgId}`).catch(() => []),
      ]);
      setTools(toolList || []);
      const first = (agents || [])[0];
      if (first) {
        setAgent(first);
        setForm({
          name: first.name,
          employeeName: first.employeeName,
          primaryLanguage: first.primaryLanguage,
          voiceId: first.voiceId,
          salesStyle: first.salesStyle,
          greetingMessage: first.greetingMessage ?? "",
          closingMessage: first.closingMessage ?? "",
          maxCallSeconds: first.maxCallSeconds,
          allowedTools: first.allowedTools ?? [],
        });
      }
    } catch {
      setError("تعذر تحميل الإعداد");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { if (!authLoading) load(); }, [authLoading, orgId]);

  const save = async () => {
    if (!orgId) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      if (agent) {
        const res = await api.patch(`/voice/agents/${agent.id}?organizationId=${orgId}`, { ...form, organizationId: orgId });
        setAgent(res.data.data);
      } else {
        const res = await api.post(`/voice/agents`, { ...form, organizationId: orgId });
        setAgent(res.data.data);
      }
      setMessage("تم الحفظ.");
    } catch (e: any) {
      setError(typeof e?.response?.data?.message === "string" ? e.response.data.message : "تعذر الحفظ");
    } finally { setSaving(false); }
  };

  const setStatus = async (status: string) => {
    if (!orgId || !agent) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const res = await api.post(`/voice/agents/${agent.id}/status?organizationId=${orgId}`, { status, organizationId: orgId });
      setAgent(res.data.data);
      setMessage(status === "ACTIVE" ? "تم تفعيل الموظف الصوتي." : "تم إيقاف الموظف الصوتي.");
    } catch (e: any) {
      const code = e?.response?.data?.message;
      setError(code === "NO_VOICE_NUMBER_CONFIGURED"
        ? "لا يمكن التفعيل قبل إضافة رقم اتصال. افتح تبويب الأرقام أولاً."
        : "تعذر تغيير الحالة");
    } finally { setSaving(false); }
  };

  const toggleTool = (id: string) => {
    setForm((f) => ({
      ...f,
      allowedTools: f.allowedTools.includes(id) ? f.allowedTools.filter((t) => t !== id) : [...f.allowedTools, id],
    }));
  };

  if (loading) return <div className="p-8 text-muted">جاري التحميل...</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      {message && <div className="bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 text-sm p-3 rounded-lg flex items-center gap-2"><Check className="w-4 h-4" /> {message}</div>}
      {error && <div className="bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400 text-sm p-3 rounded-lg">{error}</div>}

      <Section title="١. الموظف" desc="اسمه وشخصيته كما سيعرّف عن نفسه في المكالمة">
        <Field label="اسم الإعداد الداخلي"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="اسم الموظف (يُنطق للعميل)"><Input value={form.employeeName} onChange={(e) => setForm({ ...form, employeeName: e.target.value })} /></Field>
        <Field label="اللغة الأساسية">
          <select className="w-full border rounded-lg p-2.5 text-sm" value={form.primaryLanguage} onChange={(e) => setForm({ ...form, primaryLanguage: e.target.value })}>
            <option value="ar">العربية (سعودي مهني)</option>
            <option value="en">English</option>
          </select>
        </Field>
      </Section>

      <Section title="٢. الصوت والأسلوب" desc="نبرة الحديث وطريقة البيع">
        <Field label="الصوت">
          <select className="w-full border rounded-lg p-2.5 text-sm" value={form.voiceId} onChange={(e) => setForm({ ...form, voiceId: e.target.value })}>
            {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </Field>
        <Field label="أسلوب البيع">
          <select className="w-full border rounded-lg p-2.5 text-sm" value={form.salesStyle} onChange={(e) => setForm({ ...form, salesStyle: e.target.value })}>
            {STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <p className="text-xs text-muted">في كل الأساليب: ممنوع الإلحاح، والاستعجال الزائف، والتقليل من المنافسين.</p>
      </Section>

      <Section title="٣. التحية والختام" desc="أول وآخر ما يسمعه العميل">
        <Field label="التحية"><Input value={form.greetingMessage} onChange={(e) => setForm({ ...form, greetingMessage: e.target.value })} /></Field>
        <Field label="الختام"><Input value={form.closingMessage} onChange={(e) => setForm({ ...form, closingMessage: e.target.value })} /></Field>
      </Section>

      <Section title="٤. الإجراءات المسموحة" desc="ما يستطيع الموظف تنفيذه أثناء المكالمة. لا شيء مفعّل افتراضياً.">
        <div className="space-y-2">
          {tools.map((t) => (
            <label key={t.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-surface-2 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={form.allowedTools.includes(t.id)} onChange={() => toggleTool(t.id)} />
              <div className="flex-1">
                <p className="text-sm font-medium text-content">{t.id}</p>
                <p className="text-xs text-muted">{t.description}</p>
                {t.verificationLevel !== "NO_VERIFICATION" && (
                  <span className="inline-block text-[11px] bg-alert-50 dark:bg-alert-700/20 text-alert-700 dark:text-alert-300 px-2 py-0.5 rounded mt-1">يتطلب تحقق هوية</span>
                )}
              </div>
            </label>
          ))}
        </div>
      </Section>

      <Section title="٥. حدود المكالمة" desc="حماية من المكالمات المنسية">
        <Field label="أقصى مدة للمكالمة (ثانية)">
          <Input type="number" dir="ltr" value={form.maxCallSeconds} onChange={(e) => setForm({ ...form, maxCallSeconds: Number(e.target.value) })} />
        </Field>
      </Section>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button onClick={save} disabled={saving || !form.name || !form.employeeName}>{saving ? "جاري الحفظ..." : "حفظ الإعداد"}</Button>
        {agent && agent.status !== "ACTIVE" && (
          <Button variant="outline" onClick={() => setStatus("ACTIVE")} disabled={saving}>تفعيل الموظف الصوتي</Button>
        )}
        {agent?.status === "ACTIVE" && (
          <Button variant="outline" className="text-danger-600 dark:text-danger-400" onClick={() => setStatus("PAUSED")} disabled={saving}>إيقاف مؤقت</Button>
        )}
        {agent && (
          <span className="text-sm text-muted flex items-center gap-2">
            <Bot className="w-4 h-4" />
            الحالة: {agent.status === "ACTIVE" ? "مفعّل" : agent.status === "PAUSED" ? "متوقف" : "مسودة"} — الإصدار {agent.activeVersion}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface border rounded-lg p-6 shadow-sm">
      <h2 className="font-bold text-content">{title}</h2>
      <p className="text-sm text-muted mb-4">{desc}</p>
      <div className="space-y-3">{children}</div>
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
