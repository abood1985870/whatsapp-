"use client";

import { useEffect, useState } from "react";
import { Bot, Plus, Settings, Play, Send, UserCheck, PhoneCall, Database } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const emptyAgent = { name: "", description: "" };

function decisionLabel(decision: string) {
  if (decision === "REPLY") return "رد مباشر";
  if (decision === "HANDOFF") return "تحويل لموظف";
  if (decision === "ASK_CLARIFICATION") return "طلب توضيح";
  if (decision === "NO_REPLY") return "بدون رد";
  return decision;
}

export default function AiAgentsPage() {
  const { user, loading: authLoading } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newAgentData, setNewAgentData] = useState(emptyAgent);
  const [configAgent, setConfigAgent] = useState<any>(null);
  const [configData, setConfigData] = useState<any>({});
  const [configBusy, setConfigBusy] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);
  const [testAgent, setTestAgent] = useState<any>(null);
  const [testInput, setTestInput] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  const orgId = user?.memberships?.[0]?.organizationId;

  const fetchAgents = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get(`/ai-agents?organizationId=${orgId}`);
      setAgents(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch AI agents", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !orgId) {
      setLoading(false);
      return;
    }
    fetchAgents();
  }, [authLoading, orgId]);

  const handleAddAgent = async () => {
    if (!newAgentData.name.trim()) return;
    try {
      await api.post("/ai-agents", { organizationId: orgId, createdById: user?.id, ...newAgentData });
      setIsAddModalOpen(false);
      setNewAgentData(emptyAgent);
      fetchAgents();
    } catch (error) {
      console.error("Failed to create AI agent", error);
    }
  };

  const openConfig = (agent: any) => {
    setConfigAgent(agent);
    setConfigFeedback(null);
    setConfigData({
      name: agent.name || "",
      description: agent.description || "",
      systemInstructions: agent.systemInstructions || "",
      greetingMessage: agent.greetingMessage || "",
      fallbackMessage: agent.fallbackMessage || "",
      handoffMessage: agent.handoffMessage || "",
      supportPhoneNumber: agent.supportPhoneNumber || "",
      autoLearningEnabled: agent.autoLearningEnabled ?? false,
      learningScope: agent.learningScope || "AGENT",
      confidenceThreshold: agent.confidenceThreshold ?? 0.7,
      autoReplyEnabled: agent.autoReplyEnabled ?? true,
      workingHoursOnly: agent.workingHoursOnly ?? false,
    });
  };

  const saveConfig = async (publishAfter: boolean) => {
    if (!configAgent) return;
    setConfigBusy(true);
    setConfigFeedback(null);
    try {
      await api.patch(`/ai-agents/${configAgent.id}`, configData);
      if (publishAfter) {
        await api.post(`/ai-agents/${configAgent.id}/publish`);
        setConfigFeedback("تم الحفظ والنشر. الوكيل نشط الآن.");
      } else {
        setConfigFeedback("تم حفظ الإعدادات.");
      }
      fetchAgents();
    } catch (error: any) {
      setConfigFeedback(error?.response?.data?.error?.message || "حدث خطأ أثناء الحفظ.");
    } finally {
      setConfigBusy(false);
    }
  };

  const runTest = async () => {
    if (!testAgent || !testInput.trim()) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await api.post(`/ai-agents/${testAgent.id}/test`, { input: testInput });
      setTestResult(res.data.data);
    } catch (error: any) {
      setTestResult({ error: error?.response?.data?.error?.message || "فشل الاختبار. تأكد من إعداد مفتاح الذكاء الاصطناعي." });
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-content mb-2">وكلاء الذكاء الاصطناعي</h1>
          <p className="text-muted text-sm">إدارة مساعدين مخصصين للرد على عملاء واتساب تلقائياً.</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          إنشاء وكيل جديد
        </Button>
      </div>

      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted">جاري التحميل...</div>
        ) : agents.length === 0 ? (
          <div className="p-16 text-center text-muted flex flex-col items-center">
            <Bot className="w-12 h-12 text-faint mb-4" />
            <p className="font-medium text-content">لا يوجد وكلاء ذكاء اصطناعي</p>
            <p className="text-sm mt-1">أنشئ أول وكيل للرد على استفسارات العملاء تلقائياً.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
            {agents.map((agent) => (
              <div key={agent.id} className="border rounded-lg p-5 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 bg-brand/10 text-brand rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${agent.status === "ACTIVE" ? "bg-qano-100 dark:bg-qano-800 text-qano-700 dark:text-qano-300" : "bg-surface-2 text-muted"}`}>
                    {agent.status === "ACTIVE" ? "نشط" : "مسودة"}
                  </span>
                </div>
                <h3 className="font-bold text-content text-lg mb-1">{agent.name}</h3>
                <p className="text-muted text-sm mb-4 line-clamp-2">{agent.description || "بدون وصف"}</p>
                <div className="flex items-center gap-2 text-xs text-faint mb-6">
                  <span>آخر تحديث: {new Date(agent.updatedAt).toLocaleDateString("ar-SA")}</span>
                </div>

                <div className="flex gap-2 border-t pt-4">
                  <Button variant="outline" className="flex-1 gap-2 text-xs" onClick={() => openConfig(agent)}>
                    <Settings className="w-3.5 h-3.5" />
                    الإعدادات
                  </Button>
                  <Button
                    variant="secondary"
                    className="flex-1 gap-2 text-xs bg-qano-50 dark:bg-qano-900 hover:bg-qano-100 dark:bg-qano-800 text-qano-700 dark:text-qano-300 border border-qano-200 dark:border-qano-800"
                    onClick={() => { setTestAgent(agent); setTestInput(""); setTestResult(null); }}
                  >
                    <Play className="w-3.5 h-3.5" />
                    اختبار
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إنشاء وكيل ذكاء اصطناعي">
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-muted mb-1">اسم الوكيل</label>
            <Input
              value={newAgentData.name}
              onChange={(e) => setNewAgentData({ ...newAgentData, name: e.target.value })}
              placeholder="مثال: مساعد الدعم"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">الوصف</label>
            <textarea
              className="w-full rounded border border-line p-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand min-h-[80px]"
              value={newAgentData.description}
              onChange={(e) => setNewAgentData({ ...newAgentData, description: e.target.value })}
              placeholder="وصف قصير لدور هذا الوكيل..."
            />
          </div>
          <Button className="w-full" onClick={handleAddAgent} disabled={!newAgentData.name.trim()}>
            إنشاء الوكيل
          </Button>
          <p className="text-xs text-faint text-center">بعد الإنشاء، افتح الإعدادات واكتب تعليمات الوكيل ثم انشره.</p>
        </div>
      </Modal>

      <Modal isOpen={!!configAgent} onClose={() => setConfigAgent(null)} title={`إعدادات: ${configAgent?.name || ""}`}>
        <div className="space-y-4 pt-2 max-h-[70vh] overflow-y-auto pl-1">
          {configFeedback && (
            <div className={`px-3 py-2 rounded-lg text-sm ${configFeedback.includes("خطأ") ? "bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400" : "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300"}`}>
              {configFeedback}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-muted mb-1">تعليمات الوكيل</label>
            <textarea
              className="w-full rounded border border-line p-3 text-sm min-h-[140px]"
              value={configData.systemInstructions}
              onChange={(e) => setConfigData({ ...configData, systemInstructions: e.target.value })}
              placeholder="مثال: أنت مساعد دعم عربي. أجب باختصار ووضوح، ولا تخترع معلومات غير موجودة."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">رسالة التحويل لموظف</label>
            <Input
              value={configData.handoffMessage}
              onChange={(e) => setConfigData({ ...configData, handoffMessage: e.target.value })}
              placeholder="سأحوّلك لأحد الموظفين لمساعدتك."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted mb-1">رسالة بديلة</label>
            <Input
              value={configData.fallbackMessage}
              onChange={(e) => setConfigData({ ...configData, fallbackMessage: e.target.value })}
              placeholder="لم أتمكن من الإجابة بدقة، سأحوّلك للدعم."
            />
          </div>
          <div className="border rounded-lg p-4 space-y-3 bg-surface-2">
            <div className="flex items-center gap-2 text-sm font-medium text-content">
              <PhoneCall className="w-4 h-4 text-brand" />
              رقم الدعم والتعلم التلقائي
            </div>
            <div>
              <label className="block text-sm font-medium text-muted mb-1">رقم دعم هذا الوكيل</label>
              <Input
                value={configData.supportPhoneNumber}
                onChange={(e) => setConfigData({ ...configData, supportPhoneNumber: e.target.value })}
                placeholder="مثال: 9665XXXXXXXX"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={configData.autoLearningEnabled}
                  onChange={(e) => setConfigData({ ...configData, autoLearningEnabled: e.target.checked })}
                />
                حفظ إجابات الدعم تلقائيا
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <Database className="w-4 h-4 text-faint" />
                <select
                  value={configData.learningScope}
                  onChange={(e) => setConfigData({ ...configData, learningScope: e.target.value })}
                  className="flex-1 rounded border border-line bg-surface px-3 py-2 text-sm"
                >
                  <option value="AGENT">لهذا الوكيل فقط</option>
                  <option value="ORGANIZATION">لكل وكلاء الحساب</option>
                </select>
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-1">حد الثقة</label>
              <Input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={configData.confidenceThreshold}
                onChange={(e) => setConfigData({ ...configData, confidenceThreshold: parseFloat(e.target.value) || 0.7 })}
              />
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={configData.autoReplyEnabled}
                  onChange={(e) => setConfigData({ ...configData, autoReplyEnabled: e.target.checked })}
                />
                الرد الآلي مفعّل
              </label>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={configData.workingHoursOnly}
                  onChange={(e) => setConfigData({ ...configData, workingHoursOnly: e.target.checked })}
                />
                ضمن أوقات العمل فقط
              </label>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => saveConfig(false)} disabled={configBusy}>حفظ</Button>
            <Button className="flex-1" onClick={() => saveConfig(true)} disabled={configBusy}>حفظ ونشر</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!testAgent} onClose={() => setTestAgent(null)} title={`اختبار: ${testAgent?.name || ""}`}>
        <div className="space-y-4 pt-2">
          <div className="flex gap-2">
            <Input
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") runTest(); }}
              placeholder="اكتب رسالة كأنك العميل..."
            />
            <Button onClick={runTest} disabled={testBusy || !testInput.trim()} className="gap-1 shrink-0">
              <Send className="w-4 h-4" />
              {testBusy ? "..." : "إرسال"}
            </Button>
          </div>

          {testBusy && <div className="text-center text-faint text-sm py-6">الوكيل يفكر...</div>}

          {testResult && !testResult.error && (
            <div className="border rounded-lg p-4 bg-surface-2 space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <span className={`px-2 py-1 rounded-full ${testResult.decision === "REPLY" ? "bg-qano-100 dark:bg-qano-800 text-qano-700 dark:text-qano-300" : "bg-alert-100 dark:bg-alert-700/30 text-alert-700 dark:text-alert-300"}`}>
                  {decisionLabel(testResult.decision)}
                </span>
                <span className="text-muted">الثقة: {Math.round((testResult.confidence || 0) * 100)}%</span>
                <span className="text-faint">{testResult.latencyMs}ms</span>
              </div>
              {testResult.output ? (
                <div className="bg-surface border rounded-lg p-3 text-sm text-content whitespace-pre-wrap">{testResult.output}</div>
              ) : (
                <div className="text-sm text-muted flex items-center gap-2">
                  <UserCheck className="w-4 h-4" />
                  {testResult.reason}
                </div>
              )}
            </div>
          )}

          {testResult?.error && (
            <div className="bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400 border border-danger-500/30 rounded-lg p-3 text-sm">{testResult.error}</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
