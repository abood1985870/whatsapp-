"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet, SAR } from "@/lib/marketing";
import { CALL_STATUS_AR, formatDuration, OUTCOME_AR } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Mic } from "lucide-react";

export default function CallDetailPage() {
  const { user } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recordingNote, setRecordingNote] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !id) return;
    apiGet(`/voice/calls/${id}?organizationId=${orgId}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [orgId, id]);

  const requestRecording = async () => {
    if (!orgId) return;
    try {
      const res = await api.post(`/voice/calls/${id}/recording-access?organizationId=${orgId}`, { organizationId: orgId });
      setRecordingNote(res.data.data?.note ?? "غير متاح");
    } catch {
      setRecordingNote("ليس لديك صلاحية الوصول للتسجيلات.");
    }
  };

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;
  if (!data) return <div className="p-8 text-gray-500">المكالمة غير موجودة.</div>;

  const c = data.call;
  const summary = c.structuredSummary;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900" dir="ltr">{c.fromNumber}</h2>
          <p className="text-sm text-gray-500">
            {new Date(c.startedAt).toLocaleString("ar-SA")} — {formatDuration(c.durationSeconds)} —{" "}
            {CALL_STATUS_AR[c.status] || c.status}
          </p>
        </div>
        <div className="flex gap-2">
          {c.recordingEnabled && (
            <Button variant="outline" className="gap-2" onClick={requestRecording}><Mic className="w-4 h-4" /> طلب التسجيل</Button>
          )}
        </div>
      </div>

      {recordingNote && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 text-sm p-3 rounded-lg flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" /> {recordingNote}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="النتيجة" value={c.salesOutcome ? OUTCOME_AR[c.salesOutcome] || c.salesOutcome : "—"} />
        <Stat label="يحتاج دعم" value={c.supportRequired ? "نعم" : "لا"} />
        <Stat label="البرنامج" value={data.product?.nameArabic ?? "—"} />
        <Stat label="تكلفة تقديرية" value={SAR(c.estimatedCostMinor ?? 0)} />
      </div>

      {summary && (
        <div className="bg-white border rounded-lg p-6 shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-gray-900 mb-1">الملخص</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{summary.summary}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <List title="ما قاله العميل (حقائق)" items={summary.statedFacts} />
            <List title="استنتاجات المساعد" items={summary.inferences} muted />
            <List title="أسئلته" items={summary.questions} />
            <List title="اعتراضاته" items={summary.objections} />
          </div>
          {summary.nextAction && (
            <div className="pt-3 border-t">
              <p className="text-xs text-gray-500 mb-1">الإجراء التالي المقترح</p>
              <p className="text-sm text-gray-800">{summary.nextAction}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-3">نص المكالمة</h3>
        {data.transcript.length === 0 ? (
          <p className="text-sm text-gray-400">لا يوجد نص لهذه المكالمة.</p>
        ) : (
          <div className="space-y-3">
            {data.transcript.map((t: any) => (
              <div key={t.turnIndex} className={`flex ${t.speaker === "CUSTOMER" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                  t.speaker === "CUSTOMER" ? "bg-gray-100 text-gray-800" : "bg-gold-50 text-charcoal-900"
                }`}>
                  <p className="text-[11px] text-gray-500 mb-0.5">{t.speaker === "CUSTOMER" ? "العميل" : "الموظف"}</p>
                  <p className="whitespace-pre-wrap">{t.text}</p>
                  {t.containsPii && <p className="text-[11px] text-yellow-700 mt-1">تم إخفاء بيانات حساسة</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">العمليات المنفذة</h3>
          {data.toolExecutions.length === 0 ? (
            <p className="text-sm text-gray-400">لم تُنفّذ أي عملية.</p>
          ) : (
            <div className="space-y-2">
              {data.toolExecutions.map((t: any, i: number) => (
                <div key={i} className="flex justify-between items-start text-sm border-b pb-2 last:border-0">
                  <span className="text-gray-700">{t.toolId}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    t.status === "SUCCEEDED" ? "bg-green-50 text-green-700"
                      : t.status === "DENIED" ? "bg-yellow-50 text-yellow-700" : "bg-red-50 text-red-700"
                  }`}>
                    {t.status === "SUCCEEDED" ? "نجحت" : t.status === "DENIED" ? `مرفوضة: ${t.denyReason}` : "فشلت"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-3">سجل الأحداث</h3>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {data.events.map((e: any) => (
              <div key={e.id} className="text-xs text-gray-600 flex justify-between gap-3">
                <span>{e.eventType}{e.toStatus ? ` → ${CALL_STATUS_AR[e.toStatus] || e.toStatus}` : ""}</span>
                <span className="text-gray-400 shrink-0">{new Date(e.createdAt).toLocaleTimeString("ar-SA")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm text-center">
      <p className="text-base font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function List({ title, items, muted }: { title: string; items?: string[]; muted?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p className={`text-xs font-medium mb-1 ${muted ? "text-gray-400" : "text-gray-600"}`}>{title}</p>
      <ul className="text-sm text-gray-700 list-disc mr-5 space-y-0.5">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}
