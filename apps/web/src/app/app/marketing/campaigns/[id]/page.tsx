"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet, RECIPIENT_STATUS_AR } from "@/lib/marketing";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/marketing/StatusBadge";
import { Play, Pause, X, FlaskConical, Eye, RefreshCw, Sparkles } from "lucide-react";

export default function CampaignDetailPage() {
  const { user } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<any[] | null>(null);
  const [dryRun, setDryRun] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !id) return;
    try { setData(await apiGet(`/marketing/campaigns/${id}?organizationId=${orgId}`)); }
    catch { /* ignore */ } finally { setLoading(false); }
  }, [orgId, id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!data) return;
    const status = data.campaign?.status;
    if (status === "PREPARING" || status === "RUNNING") {
      const t = setInterval(load, 4000);
      return () => clearInterval(t);
    }
  }, [data, load]);

  const act = async (action: string, body?: any) => {
    if (!orgId) return;
    setBusy(action); setMsg(null);
    try {
      const res = await api.post(`/marketing/campaigns/${id}/${action}?organizationId=${orgId}`, body || {});
      if (action === "test-send") {
        const r = res.data.data;
        setMsg(r.sent ? "تم إرسال التجربة إلى رقمك." : `لم تُرسل التجربة: ${r.skippedReason || r.error || "غير معروف"}`);
      }
      await load();
    } catch (e: any) {
      setMsg(typeof e?.response?.data?.message === "string" ? e.response.data.message : "تعذر تنفيذ العملية");
    } finally { setBusy(null); }
  };

  const loadPreviews = async () => {
    if (!orgId) return;
    setBusy("preview");
    try { setPreviews(await apiGet(`/marketing/campaigns/${id}/preview?organizationId=${orgId}`)); }
    catch { /* ignore */ } finally { setBusy(null); }
  };

  const loadDryRun = async () => {
    if (!orgId) return;
    setBusy("dry-run");
    try { setDryRun(await apiGet(`/marketing/campaigns/${id}/dry-run?organizationId=${orgId}`)); }
    catch { /* ignore */ } finally { setBusy(null); }
  };

  if (loading) return <div className="p-8 text-muted">جاري التحميل...</div>;
  if (!data) return <div className="p-8 text-muted">الحملة غير موجودة.</div>;

  const c = data.campaign;
  const status = c.status;
  const firstReady = previews?.[0];

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-bold text-content">{c.name}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="text-sm text-muted">{c.product?.nameArabic}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "DRAFT" && <Button className="gap-2" disabled={busy !== null} onClick={() => act("prepare")}><Sparkles className="w-4 h-4" /> تجهيز الرسائل</Button>}
          {(status === "READY" || status === "PAUSED") && <Button className="gap-2" disabled={busy !== null} onClick={() => act("start")}><Play className="w-4 h-4" /> {status === "PAUSED" ? "استئناف" : "بدء الحملة"}</Button>}
          {status === "RUNNING" && <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={() => act("pause")}><Pause className="w-4 h-4" /> إيقاف مؤقت</Button>}
          {["DRAFT", "PREPARING", "READY", "RUNNING", "PAUSED"].includes(status) && (
            <Button variant="outline" className="gap-2 text-danger-600 dark:text-danger-400" disabled={busy !== null}
              onClick={() => { if (confirm("إلغاء الحملة؟")) act("cancel"); }}><X className="w-4 h-4" /> إلغاء</Button>
          )}
        </div>
      </div>

      {msg && <div className="bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 text-sm p-3 rounded-lg">{msg}</div>}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <Stat label="المستقبلون" value={c.totalRecipients} />
        <Stat label="أُرسلت" value={c.sentCount} color="text-qano-600 dark:text-qano-400" />
        <Stat label="ردود" value={c.repliedCount} color="text-qano-600 dark:text-qano-400" />
        <Stat label="فشل" value={c.failedCount} color="text-danger-600 dark:text-danger-400" />
        <Stat label="متخطى" value={c.skippedCount} />
        {Object.entries(data.statusCounts || {}).filter(([k]) => ["SKIPPED_DNC", "SKIPPED_PREVIOUS_CONTACT"].includes(k)).map(([k, v]) => (
          <Stat key={k} label={RECIPIENT_STATUS_AR[k]} value={v as number} />
        ))}
      </div>

      {(status === "READY" || status === "PREPARING" || status === "PAUSED") && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={loadPreviews}><Eye className="w-4 h-4" /> عاين الرسائل</Button>
          <Button variant="outline" className="gap-2" disabled={busy !== null} onClick={loadDryRun}><RefreshCw className="w-4 h-4" /> تشغيل تجريبي (Dry Run)</Button>
          {firstReady && (
            <Button variant="outline" className="gap-2" disabled={busy !== null}
              onClick={() => act("test-send", { recipientId: firstReady.recipientId })}><FlaskConical className="w-4 h-4" /> أرسل تجربة إلى رقمي</Button>
          )}
        </div>
      )}

      {dryRun && (
        <div className="bg-surface border rounded-lg p-5 shadow-sm">
          <h3 className="font-bold text-content mb-3">نتيجة التشغيل التجريبي</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <Stat label="سيُرسل" value={dryRun.report.wouldSend} color="text-qano-600 dark:text-qano-400" />
            <Stat label="عدم تواصل" value={dryRun.report.dnc} color="text-danger-600 dark:text-danger-400" />
            <Stat label="سبق التواصل" value={dryRun.report.previouslyContacted} />
            <Stat label="مكرر/ملغى" value={dryRun.report.duplicates} />
            <Stat label="تخصيص معلّق" value={dryRun.report.personalizationPending} />
            <Stat label="تخصيص فشل" value={dryRun.report.personalizationFailed} color="text-danger-600 dark:text-danger-400" />
            <Stat label="أُرسلت سابقاً" value={dryRun.report.alreadySent} />
            <Stat label="ردّت" value={dryRun.report.replied} />
          </div>
        </div>
      )}

      {previews && (
        <div className="bg-surface border rounded-lg p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-content">عينات من الرسائل المخصّصة</h3>
          {previews.length === 0 ? (
            <p className="text-sm text-faint">لا توجد رسائل جاهزة بعد. شغّل التجهيز أولاً.</p>
          ) : previews.map((p) => (
            <div key={p.recipientId} className="border rounded-lg p-3 bg-surface-2">
              <p className="text-xs text-muted mb-1">{p.businessName}</p>
              <p className="text-sm text-content whitespace-pre-wrap">{p.message}</p>
              <button className="text-xs text-qano-600 dark:text-qano-400 mt-2 hover:underline"
                onClick={() => act(`recipients/${p.recipientId}/regenerate`)}>إعادة توليد</button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-surface-2 font-medium text-muted text-sm">المستقبلون</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-muted">المنشأة</th>
                <th className="px-6 py-3 font-medium text-muted">الجوال</th>
                <th className="px-6 py-3 font-medium text-muted">الحالة</th>
                <th className="px-6 py-3 font-medium text-muted">التخصيص</th>
                <th className="px-6 py-3 font-medium text-muted">خطأ</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.recipients.items.map((r: any) => (
                <tr key={r.id} className="hover:bg-surface-2">
                  <td className="px-6 py-3 font-medium">{r.lead?.businessName}</td>
                  <td className="px-6 py-3 text-muted" dir="ltr">{r.lead?.rawPhone}</td>
                  <td className="px-6 py-3"><span className="text-xs bg-surface-2 px-2 py-0.5 rounded">{RECIPIENT_STATUS_AR[r.status] || r.status}</span></td>
                  <td className="px-6 py-3 text-muted text-xs">{r.personalizationStatus}</td>
                  <td className="px-6 py-3 text-danger-500 text-xs">{r.errorMessage || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-3 text-xs text-faint border-t">الإجمالي: {data.recipients.total}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-surface border rounded-lg p-3 shadow-sm text-center">
      <p className={`text-2xl font-bold ${color || "text-content"}`}>{value ?? 0}</p>
      <p className="text-[11px] text-muted mt-1">{label}</p>
    </div>
  );
}
