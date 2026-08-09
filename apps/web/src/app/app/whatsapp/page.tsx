"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { MessageCircle, Plus, QrCode, Trash2, RefreshCw, Link as LinkIcon } from "lucide-react";

export default function WhatsAppConnectionsPage() {
  const { user } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [newConnectionName, setNewConnectionName] = useState("");
  const [currentQr, setCurrentQr] = useState<string | null>(null);

  const orgId = user?.memberships?.[0]?.organizationId;

  const fetchConnections = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get(`/whatsapp/connections?organizationId=${orgId}`);
      setConnections(res.data.data);
    } catch (error) {
      console.error("Failed to fetch connections", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConnections();
  }, [orgId]);

  const handleAddConnection = async () => {
    if (!newConnectionName.trim()) return;
    try {
      await api.post("/whatsapp/connections", { organizationId: orgId, name: newConnectionName });
      setIsAddModalOpen(false);
      setNewConnectionName("");
      fetchConnections();
    } catch (error) {
      console.error("Failed to add connection", error);
    }
  };

  const handleViewQr = async (id: string) => {
    try {
      const res = await api.get(`/whatsapp/connections/${id}/qr`);
      const qrCode = res.data.data.qrCode || res.data.data.qrcode;
      if (qrCode) {
        setCurrentQr(qrCode);
        setIsQrModalOpen(true);
      } else {
        alert("رمز الاستجابة غير متاح حالياً. تأكد من حالة الاتصال.");
      }
    } catch (error) {
      console.error("Failed to fetch QR", error);
      alert("حدث خطأ أثناء جلب رمز الاستجابة السريعة.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الاتصال؟")) return;
    try {
      await api.delete(`/whatsapp/connections/${id}`);
      fetchConnections();
    } catch (error) {
      console.error("Failed to delete connection", error);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">اتصالات واتساب</h1>
          <p className="text-gray-500 text-sm">إدارة الأرقام المرتبطة بالمنصة</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          إضافة رقم جديد
        </Button>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : connections.length === 0 ? (
          <div className="p-16 text-center text-gray-500 flex flex-col items-center">
            <MessageCircle className="w-12 h-12 text-gray-300 mb-4" />
            <p className="font-medium text-gray-900">لا يوجد اتصالات حالياً</p>
            <p className="text-sm mt-1">قم بإضافة رقم واتساب جديد للبدء في استقبال الرسائل.</p>
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
              {connections.map((conn) => (
                <tr key={conn.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium">{conn.name}</td>
                  <td className="px-6 py-4 text-gray-500" dir="ltr">{conn.phoneNumber || "-"}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                      conn.status === "CONNECTED" ? "bg-green-100 text-green-700" :
                      ["PENDING", "QR_REQUIRED", "CONNECTING", "CREATING"].includes(conn.status) ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        conn.status === "CONNECTED" ? "bg-green-500" :
                        ["PENDING", "QR_REQUIRED", "CONNECTING", "CREATING"].includes(conn.status) ? "bg-yellow-500" :
                        "bg-gray-500"
                      }`}></span>
                      {conn.status === "CONNECTED" ? "متصل" : ["PENDING", "QR_REQUIRED", "CONNECTING", "CREATING"].includes(conn.status) ? "في الانتظار" : "غير متصل"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {new Date(conn.createdAt).toLocaleDateString("ar-SA")}
                  </td>
                  <td className="px-6 py-4 text-left">
                    <div className="flex items-center justify-end gap-2">
                      {conn.status !== "CONNECTED" && (
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
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="إضافة رقم واتساب جديد">
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم الاتصال (مثال: رقم الدعم الرئيسي)</label>
            <Input 
              value={newConnectionName} 
              onChange={(e) => setNewConnectionName(e.target.value)} 
              placeholder="أدخل اسماً يميز هذا الرقم"
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
            افتح تطبيق واتساب على هاتفك، ثم اذهب إلى "الأجهزة المرتبطة" وامسح الرمز أدناه:
          </p>
          {currentQr ? (
            <img src={currentQr} alt="WhatsApp QR Code" className="w-64 h-64 border rounded-xl shadow-sm" />
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
