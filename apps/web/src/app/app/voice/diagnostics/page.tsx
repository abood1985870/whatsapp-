"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { apiGet } from "@/lib/marketing";
import { HEALTH_AR, HEALTH_COLOR, PROVIDER_STATUS_AR } from "@/lib/voice";
import { Button } from "@/components/ui/button";
import { Activity, RefreshCw } from "lucide-react";

export default function VoiceDiagnosticsPage() {
  const { user, loading: authLoading } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [providerResult, setProviderResult] = useState<any>(null);
  const [realtimeResult, setRealtimeResult] = useState<any>(null);

  const load = () => {
    if (!orgId) { setLoading(false); return; }
    apiGet(`/voice/diagnostics?organizationId=${orgId}`).then(setData).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { if (!authLoading) load(); }, [authLoading, orgId]);

  const runProviderCheck = async () => {
    if (!orgId) return;
    setBusy("provider"); setProviderResult(null);
    try {
      const res = await api.post(`/voice/diagnostics/provider-check`, { organizationId: orgId });
      setProviderResult(res.data.data);
      load();
    } catch { setProviderResult({ status: "ERROR", detail: "تعذر تشغيل الفحص" }); }
    finally { setBusy(null); }
  };

  const runRealtimeCheck = async () => {
    if (!orgId) return;
    setBusy("realtime"); setRealtimeResult(null);
    try {
      const res = await api.post(`/voice/diagnostics/realtime-check`, { organizationId: orgId });
      setRealtimeResult(res.data.data);
    } catch { setRealtimeResult({ status: "ERROR", detail: "تعذر تشغيل الفحص" }); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="p-8 text-gray-500">جاري التحميل...</div>;

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="bg-white border rounded-lg p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-gray-900 flex items-center gap-2"><Activity className="w-5 h-5 text-gray-400" /> حالة المكوّنات</h2>
            <p className="text-sm text-gray-500">
              المزوّد: {data?.provider} — {PROVIDER_STATUS_AR[data?.providerStatus] ?? data?.providerStatus}
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
        </div>
        <div className="space-y-2">
          {(data?.components ?? []).map((c: any) => (
            <div key={c.name} className="flex items-start justify-between gap-4 py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium text-gray-800">{c.name}</p>
                {c.detail && <p className="text-xs text-gray-500 mt-0.5">{c.detail}</p>}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${HEALTH_COLOR[c.status] || "bg-gray-100"}`}>
                {HEALTH_AR[c.status] || c.status}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">مكالمات نشطة الآن: {data?.activeCalls ?? 0}</p>
      </div>

      <div className="bg-white border rounded-lg p-6 shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-gray-900 mb-1">فحوصات الاتصال الحقيقية</h2>
          <p className="text-sm text-gray-500">كل فحص يجري اتصالاً فعلياً بالخدمة — لا يعتمد على وجود المتغيرات فقط.</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={runProviderCheck} disabled={busy !== null}>
            {busy === "provider" ? "جاري الفحص..." : "فحص مزوّد الاتصالات"}
          </Button>
          <Button variant="outline" onClick={runRealtimeCheck} disabled={busy !== null}>
            {busy === "realtime" ? "جاري الفحص..." : "فحص المحرك الصوتي"}
          </Button>
        </div>

        {providerResult && (
          <ResultBox
            title="مزوّد الاتصالات"
            status={PROVIDER_STATUS_AR[providerResult.status] ?? providerResult.status}
            ok={providerResult.status === "LIVE_VERIFIED"}
            detail={providerResult.detail}
          />
        )}
        {realtimeResult && (
          <ResultBox
            title="المحرك الصوتي"
            status={PROVIDER_STATUS_AR[realtimeResult.status] ?? realtimeResult.status}
            ok={realtimeResult.status === "LIVE_VERIFIED"}
            detail={realtimeResult.detail ?? (realtimeResult.latencyMs ? `زمن الاستجابة: ${realtimeResult.latencyMs}ms` : undefined)}
          />
        )}
      </div>
    </div>
  );
}

function ResultBox({ title, status, ok, detail }: { title: string; status: string; ok: boolean; detail?: string }) {
  return (
    <div className={`border rounded-lg p-3 text-sm ${ok ? "bg-green-50 border-green-200 text-green-900" : "bg-yellow-50 border-yellow-200 text-yellow-900"}`}>
      <p className="font-medium">{title}: {status}</p>
      {detail && <p className="text-xs mt-1">{detail}</p>}
    </div>
  );
}
