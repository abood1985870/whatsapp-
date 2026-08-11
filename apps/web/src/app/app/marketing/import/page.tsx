"use client";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle } from "lucide-react";

export default function ImportPage() {
  const { user } = useAuth();
  const orgId = user?.memberships?.[0]?.organizationId;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const doPreview = async () => {
    if (!orgId || !file) return;
    setLoading(true); setError(null); setPreview(null); setCommitted(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("organizationId", orgId);
    try {
      const res = await api.post(`/marketing/leads/import/preview`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(res.data.data);
    } catch (e: any) {
      setError(typeof e?.response?.data?.message === "string" ? e.response.data.message : "تعذر قراءة الملف");
    } finally { setLoading(false); }
  };

  const commit = async () => {
    if (!orgId || !preview) return;
    setCommitting(true); setError(null);
    const rows = preview.rows.map((r: any) => ({ name: r.name, phone: r.phone, website: r.website }));
    try {
      const res = await api.post(`/marketing/leads/import/commit`, { organizationId: orgId, filename: preview.filename, rows });
      setCommitted(res.data.data);
      setPreview(null);
    } catch (e: any) {
      setError("تعذر إتمام الاستيراد");
    } finally { setCommitting(false); }
  };

  const c = preview?.counts;

  return (
    <div className="p-8 max-w-2xl">
      <div className="bg-white border rounded-lg p-6 shadow-sm space-y-4">
        <p className="text-sm text-gray-500">ارفع ملف Excel (.xlsx) أو CSV يحتوي على: الاسم، الجوال (إجباري)، الموقع (اختياري).</p>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-gray-600 file:ml-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-gray-100 file:text-gray-700" />
        {error && <div className="bg-red-50 text-red-700 text-sm p-2 rounded">{error}</div>}
        <Button className="gap-2" onClick={doPreview} disabled={!file || loading}>
          <Upload className="w-4 h-4" /> {loading ? "جاري التحليل..." : "معاينة"}
        </Button>
      </div>

      {committed && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div className="text-sm text-green-800">
            تم الاستيراد: أُضيف {committed.counts?.created ?? 0} عميلاً من أصل {committed.counts?.total ?? 0}.
          </div>
        </div>
      )}

      {preview && (
        <div className="bg-white border rounded-lg p-6 shadow-sm mt-4">
          <h3 className="font-bold text-gray-900 mb-3">المعاينة: {preview.filename}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center mb-4">
            <Stat label="الكل" value={c.total} />
            <Stat label="صالح" value={c.valid} color="text-green-600" />
            <Stat label="غير صالح" value={c.invalid} />
            <Stat label="مكرر" value={c.duplicate} />
            <Stat label="عدم تواصل" value={c.dnc} color="text-red-600" />
            <Stat label="سبق التواصل" value={c.previouslyContacted} />
          </div>
          <Button onClick={commit} disabled={committing || c.valid === 0}>
            {committing ? "جاري الاستيراد..." : `استيراد ${c.valid} عميلاً صالحاً`}
          </Button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-2 bg-gray-50 rounded-lg">
      <p className={`text-xl font-bold ${color || "text-gray-900"}`}>{value ?? 0}</p>
      <p className="text-[11px] text-gray-500 mt-1">{label}</p>
    </div>
  );
}
