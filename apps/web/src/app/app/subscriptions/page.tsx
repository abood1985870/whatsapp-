"use client";
import { useEffect, useState } from "react";
import { Clock, CheckCircle2, XCircle, ShieldCheck, Search } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isPlatformOwner(user: any) {
  return (user?.memberships || []).some((m: any) => m.status === "ACTIVE" && m.role?.name === "PLATFORM_SUPER_ADMIN");
}

const STATUS_LABEL: Record<string, string> = { PENDING: "قيد المراجعة", APPROVED: "مقبول", REJECTED: "مرفوض", CANCELLED: "ملغى" };
const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-alert-50 dark:bg-alert-700/25 text-alert-700 dark:text-alert-300",
  APPROVED: "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300",
  REJECTED: "bg-danger-50 dark:bg-danger-600/10 text-danger-600 dark:text-danger-400",
  CANCELLED: "bg-surface-2 text-muted",
};

export default function SubscriptionRequestsPage() {
  const { user, loading: authLoading } = useAuth();
  const platformOwner = isPlatformOwner(user);
  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/subscription-requests", { params: { status: status || undefined, search: search || undefined } });
      setData(res.data?.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && platformOwner) load();
    if (!authLoading && !platformOwner) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, platformOwner, status]);

  const openDetail = async (id: string) => {
    setSelected(id);
    setDetail(null);
    setReason("");
    const res = await api.get(`/subscription-requests/${id}`);
    setDetail(res.data?.data);
  };

  const act = async (action: "approve" | "reject") => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(`/subscription-requests/${selected}/${action}`, action === "reject" ? { reason } : undefined);
      setToast(action === "approve" ? "تم تفعيل الاشتراك." : "تم رفض الطلب.");
      setSelected(null);
      setDetail(null);
      load();
    } catch (err: any) {
      setToast(err?.response?.data?.error?.message === "REQUEST_ALREADY_PROCESSED" ? "تمت معالجة هذا الطلب مسبقاً." : "تعذّرت العملية.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading || loading) return <div className="p-8 text-muted">جارٍ التحميل…</div>;

  if (!platformOwner) {
    return (
      <div className="p-8">
        <div className="bg-surface border rounded-lg p-8 text-center shadow-sm">
          <ShieldCheck className="w-12 h-12 mx-auto text-faint mb-3" />
          <h1 className="text-xl font-bold text-content mb-2">هذه الصفحة مخصصة لمالك المنصة</h1>
        </div>
      </div>
    );
  }

  const counts = data?.counts || {};

  return (
    <div className="p-8 space-y-6">
      <div>
        <p className="text-sm text-qano-700 dark:text-qano-300 font-medium mb-2">لوحة تحكم المالك</p>
        <h1 className="text-3xl font-bold text-content mb-2">طلبات الاشتراك</h1>
      </div>

      {toast && <div className="rounded-lg bg-surface-2 border px-4 py-2.5 text-sm text-content">{toast}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { key: "PENDING", label: "طلبات جديدة", icon: Clock },
          { key: "APPROVED", label: "مقبولة", icon: CheckCircle2 },
          { key: "REJECTED", label: "مرفوضة", icon: XCircle },
          { key: "CANCELLED", label: "ملغاة", icon: XCircle },
        ].map((c) => (
          <button
            key={c.key}
            onClick={() => setStatus(status === c.key ? "" : c.key)}
            className={`text-right bg-surface border rounded-lg p-4 shadow-sm transition-colors ${status === c.key ? "ring-2 ring-qano-500" : "hover:bg-surface-2"}`}
          >
            <c.icon className="w-4 h-4 text-muted mb-2" />
            <p className="text-2xl font-bold text-content num">{counts[c.key] ?? 0}</p>
            <p className="text-xs text-muted">{c.label}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-faint" />
          <Input placeholder="بحث بالاسم أو الشركة أو البريد" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} className="ps-9" />
        </div>
        <Button variant="secondary" onClick={load}>بحث</Button>
      </div>

      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-surface-2 border-b">
              <tr>
                <th className="px-5 py-3 text-muted font-medium">العميل</th>
                <th className="px-5 py-3 text-muted font-medium">الشركة</th>
                <th className="px-5 py-3 text-muted font-medium">الباقة</th>
                <th className="px-5 py-3 text-muted font-medium">السعر</th>
                <th className="px-5 py-3 text-muted font-medium">التاريخ</th>
                <th className="px-5 py-3 text-muted font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(data?.items || []).map((r: any) => (
                <tr key={r.id} className="cursor-pointer hover:bg-surface-2" onClick={() => openDetail(r.id)}>
                  <td className="px-5 py-3 font-medium">{r.contactName}<br /><span className="text-xs text-muted">{r.contactEmail}</span></td>
                  <td className="px-5 py-3 text-muted">{r.contactCompany || "-"}</td>
                  <td className="px-5 py-3 text-muted">{r.plan?.name}</td>
                  <td className="px-5 py-3 text-muted num">{(r.priceAtRequest / 100).toLocaleString("ar-SA")}</td>
                  <td className="px-5 py-3 text-muted num">{new Date(r.createdAt).toLocaleDateString("ar-SA")}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-muted">لا توجد طلبات.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-surface border rounded-lg shadow-pop max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            {!detail ? (
              <p className="text-muted">جارٍ التحميل…</p>
            ) : (
              <>
                <h2 className="text-lg font-bold text-content mb-1">{detail.contactName}</h2>
                <p className="text-sm text-muted">{detail.contactCompany} — {detail.contactEmail} {detail.contactPhone && `— ${detail.contactPhone}`}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-muted">الباقة</p><p className="font-medium text-content">{detail.plan?.name}</p></div>
                  <div><p className="text-muted">السعر</p><p className="font-medium text-content num">{(detail.priceAtRequest / 100).toLocaleString("ar-SA")} ريال</p></div>
                  <div><p className="text-muted">تاريخ الطلب</p><p className="font-medium text-content num">{new Date(detail.createdAt).toLocaleDateString("ar-SA")}</p></div>
                  <div><p className="text-muted">الحالة</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[detail.status]}`}>{STATUS_LABEL[detail.status]}</span></div>
                </div>
                {detail.notes && <p className="mt-3 text-sm text-muted border-t pt-3">{detail.notes}</p>}

                {detail.status === "PENDING" && (
                  <div className="mt-5 pt-5 border-t space-y-3">
                    <Input placeholder="سبب الرفض (اختياري)" value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="flex gap-3">
                      <Button className="flex-1" loading={busy} onClick={() => act("approve")}>قبول الاشتراك</Button>
                      <Button variant="danger" className="flex-1" loading={busy} onClick={() => act("reject")}>رفض الاشتراك</Button>
                    </div>
                  </div>
                )}
                {detail.status === "REJECTED" && detail.rejectionReason && (
                  <p className="mt-4 text-sm text-danger-600 dark:text-danger-400 border-t pt-3">سبب الرفض: {detail.rejectionReason}</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
