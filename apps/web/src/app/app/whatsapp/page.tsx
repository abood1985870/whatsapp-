"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, MessageCircle, Plus, QrCode, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const pendingStatuses = ["PENDING", "QR_REQUIRED", "CONNECTING", "CREATING"];

function statusLabel(status: string) {
  if (status === "CONNECTED") return "متصل";
  if (pendingStatuses.includes(status)) return "في الانتظار";
  if (status === "ERROR") return "يحتاج حذف أو إعادة محاولة";
  return "غير متصل";
}

export default function WhatsAppConnectionsPage() {
  const { user, loading: authLoading } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [newConnectionName, setNewConnectionName] = useState("");
  const [currentQr, setCurrentQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const orgId = user?.memberships?.[0]?.organizationId;

  const activeSetupConnection = useMemo(
    () => connections.find((connection) => connection.status !== "CONNECTED"),
    [connections]
  );

  const visibleConnections = useMemo(() => {
    const connected = connections.filter((connection) => connection.status === "CONNECTED");
    return activeSetupConnection ? [activeSetupConnection, ...connected] : connected;
  }, [activeSetupConnection, connections]);

  const hiddenDuplicates = Math.max(0, connections.length - visibleConnections.length);
  const canCreateNewConnection = !activeSetupConnection;

  const fetchConnections = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get(`/whatsapp/connections?organizationId=${orgId}`);
      setConnections(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch connections", error);
      setFeedback("تعذر تحميل اتصالات واتساب. حاول تحديث الصفحة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !orgId) {
      setLoading(false);
      return;
    }
    fetchConnections();
  }, [authLoading, orgId]);

  const handleAddConnection = async () => {
    if (!orgId) return;
    if (!canCreateNewConnection) {
      setIsAddModalOpen(false);
      setFeedback("أكمل الربط الحالي أولاً أو احذفه قبل إنشاء ربط جديد.");
      return;
    }
    if (!newConnectionName.trim()) return;
    try {
      await api.post("/whatsapp/connections", { organizationId: orgId, name: newConnectionName.trim() });
      setIsAddModalOpen(false);
      setNewConnectionName("");
      setFeedback(null);
      fetchConnections();
    } catch (error: any) {
      console.error("Failed to add connection", error);
      setFeedback(error?.response?.data?.error?.message || "تعذر إنشاء اتصال واتساب جديد.");
    }
  };

  const handleViewQr = async (id: string) => {
    setCurrentQr(null);
    setQrError(null);
    setIsQrModalOpen(true);
    try {
      const res = await api.get(`/whatsapp/connections/${id}/qr`);
      const qrCode = res.data.data.qrCode || res.data.data.qrcode;
      if (!qrCode) {
        setQrError("رمز QR غير متاح حالياً. اضغط تحديث الحالة أو احذف الاتصال وأنشئ واحداً جديداً بعد قليل.");
        return;
      }
      setCurrentQr(qrCode);
    } catch (error: any) {
      console.error("Failed to fetch QR", error);
      setQrError(error?.response?.data?.error?.message || "تعذر جلب رمز QR الآن. حاول مرة أخرى بعد قليل.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الاتصال؟")) return;
    try {
      await api.delete(`/whatsapp/connections/${id}`);
      setFeedback(null);
      fetchConnections();
    } catch (error: any) {
      console.error("Failed to delete connection", error);
      setFeedback(error?.response?.data?.error?.message || "تعذر حذف الاتصال.");
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">اتصالات واتساب</h1>
          <p className="text-gray-500 text-sm">أكمل ربط الرقم الحالي أولاً. لا يمكن إنشاء ربط جديد قبل اكتمال الأول.</p>
        </div>
        <Button
          onClick={() => canCreateNewConnection ? setIsAddModalOpen(true) : setFeedback("أكمل الربط الحالي أولاً أو احذفه قبل إنشاء ربط جديد.")}
          className="gap-2"
          disabled={!canCreateNewConnection}
          title={!canCreateNewConnection ? "أكمل الربط الحالي أولاً" : "إضافة رقم جديد"}
        >
          <Plus className="w-4 h-4" />
          إضافة رقم جديد
        </Button>
      </div>

      {(feedback || hiddenDuplicates > 0 || activeSetupConnection) && (
        <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            {activeSetupConnection && <p>يوجد ربط غير مكتمل. امسح QR لهذا الربط أو احذفه قبل إنشاء ربط جديد.</p>}
            {hiddenDuplicates > 0 && <p>تم إخفاء {hiddenDuplicates} ربط مكرر قديم لتقليل اللخبطة. التنظيف النهائي يحتاج موافقتك الصريحة.</p>}
            {feedback && <p>{feedback}</p>}
          </div>
        </div>
      )}

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : !orgId ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <MessageCircle className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-900">لا توجد منظمة مرتبطة بالحساب</p>
            <p className="text-sm mt-1">سجل الدخول بحساب عميل فعّال أو اطلب من مالك المنصة إنشاء حساب عميل لك.</p>
          </div>
        ) : visibleConnections.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <MessageCircle className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-900">لا توجد اتصالات حالياً</p>
            <p className="text-sm mt-1">أضف رقم واتساب جديد ثم امسح رمز QR من تطبيق واتساب.</p>
          </div>
        ) : (
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-4 font-medium text-gray-500">الاسم</th>
                <th className="px-6 py-4 font-medium text-gray-500">الرقم</th>
                <th className="px-6 py-4 font-medium text-gray-500">الحالة</th>
                <th className="px-6 py-4 font-medium text-gray-500">تاريخ الإضافة</th>
                <th className="px-6 py-4 font-medium text-gray-500 text-left">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleConnections.map((conn) => {
                const connected = conn.status === "CONNECTED";
                const pending = pendingStatuses.includes(conn.status);
                return (
                  <tr key={conn.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium">{conn.name}</td>
                    <td className="px-6 py-4 text-gray-500" dir="ltr">{conn.phoneNumber || "-"}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        connected ? "bg-green-100 text-green-700" : pending ? "bg-yellow-100 text-yellow-700" : "bg-red-50 text-red-700"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500" : pending ? "bg-yellow-500" : "bg-red-500"}`}></span>
                        {statusLabel(conn.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(conn.createdAt).toLocaleDateString("ar-SA")}
                    </td>
                    <td className="px-6 py-4 text-left">
                      <div className="flex items-center justify-end gap-2">
                        {!connected && conn.providerInstanceId && (
                          <Button variant="outline" size="sm" onClick={() => handleViewQr(conn.id)} title="مسح رمز QR">
                            <QrCode className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => fetchConnections()} title="تحديث الحالة">
                          <RefreshCw className="w-4 h-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(conn.id)} title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة رقم واتساب جديد">
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم الاتصال</label>
            <Input
              value={newConnectionName}
              onChange={(e) => setNewConnectionName(e.target.value)}
              placeholder="مثال: رقم الدعم الرئيسي"
            />
          </div>
          <Button className="w-full" onClick={handleAddConnection} disabled={!newConnectionName.trim()}>
            إنشاء الاتصال
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isQrModalOpen} onClose={() => setIsQrModalOpen(false)} title="ربط واتساب">
        <div className="flex flex-col items-center justify-center p-4 space-y-4">
          <p className="text-sm text-gray-500 text-center mb-2">
            افتح واتساب في الجوال، ثم الأجهزة المرتبطة، وبعدها امسح الرمز. استخدم QR واحد فقط ولا تضغط إنشاء ربط جديد.
          </p>
          {currentQr ? (
            <img src={currentQr} alt="WhatsApp QR Code" className="w-64 h-64 border rounded-xl shadow-sm" />
          ) : qrError ? (
            <div className="w-full rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-700">
              {qrError}
            </div>
          ) : (
            <div className="w-64 h-64 border rounded-xl flex items-center justify-center bg-gray-50">
              <RefreshCw className="w-8 h-8 text-gray-300 animate-spin" />
            </div>
          )}
          <Button variant="outline" className="w-full mt-4" onClick={() => setIsQrModalOpen(false)}>
            إغلاق
          </Button>
        </div>
      </Modal>
    </div>
  );
}
