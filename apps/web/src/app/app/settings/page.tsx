"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { User, Building, Bell, Shield, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [feedback, setFeedback] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [profileName, setProfileName] = useState("");
  const [org, setOrg] = useState<any>(null);
  const [orgDisplayName, setOrgDisplayName] = useState("");
  const [orgLegalName, setOrgLegalName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const orgId = user?.memberships?.[0]?.organizationId;

  useEffect(() => {
    if (user?.name) setProfileName(user.name);
  }, [user]);

  useEffect(() => {
    if (!orgId) return;
    api.get(`/organizations/${orgId}`).then((res) => {
      const data = res.data.data;
      setOrg(data);
      setOrgDisplayName(data.displayName || "");
      setOrgLegalName(data.legalName || "");
    }).catch((err) => console.error("Failed to load organization", err));
  }, [orgId]);

  const notify = (type: "ok" | "error", text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  const run = async (action: () => Promise<any>, okMessage: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      notify("ok", okMessage);
    } catch (err: any) {
      notify("error", err?.response?.data?.error?.message || "حدث خطأ، حاول مرة أخرى");
    }
    setBusy(false);
  };

  const saveProfile = () => run(
    () => api.post("/auth/update-profile", { name: profileName }),
    "تم حفظ الملف الشخصي"
  );

  const saveOrganization = () => run(
    () => api.patch(`/organizations/${orgId}`, { displayName: orgDisplayName, legalName: orgLegalName }),
    "تم تحديث بيانات المؤسسة"
  );

  const changePassword = () => {
    if (newPassword !== confirmPassword) {
      notify("error", "كلمتا المرور غير متطابقتين");
      return;
    }
    if (newPassword.length < 6) {
      notify("error", "كلمة المرور الجديدة قصيرة جداً (6 أحرف على الأقل)");
      return;
    }
    return run(async () => {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    }, "تم تغيير كلمة المرور بنجاح");
  };

  const tabs = [
    { key: "profile", label: "الملف الشخصي", icon: User },
    { key: "organization", label: "إعدادات المؤسسة", icon: Building },
    { key: "notifications", label: "الإشعارات", icon: Bell },
    { key: "security", label: "الأمان وكلمة المرور", icon: Shield },
    { key: "api", label: "مفاتيح API", icon: Key },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">الإعدادات</h1>
        <p className="text-gray-500 text-sm">إدارة حسابك وإعدادات المؤسسة والتفضيلات</p>
      </div>

      {feedback && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm ${feedback.type === "ok" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
          {feedback.text}
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="w-full md:w-64 flex flex-col gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key ? "bg-gold-50 text-gold-700" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white border rounded-xl shadow-sm p-6 md:p-8">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-4">الملف الشخصي</h2>

              <div className="flex items-center gap-6 mb-6">
                <div className="w-20 h-20 bg-gold-100 text-gold-700 rounded-full flex items-center justify-center text-3xl font-bold">
                  {user?.name?.charAt(0) || "U"}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">الاسم الكامل</label>
                  <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">البريد الإلكتروني</label>
                  <Input defaultValue={user?.email || ""} disabled />
                </div>
              </div>

              <div className="pt-6 border-t mt-8">
                <Button onClick={saveProfile} disabled={busy || !profileName.trim()}>حفظ التغييرات</Button>
              </div>
            </div>
          )}

          {activeTab === "organization" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-4">إعدادات المؤسسة</h2>

              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">اسم المؤسسة (المعروض)</label>
                  <Input value={orgDisplayName} onChange={(e) => setOrgDisplayName(e.target.value)} placeholder={org ? "" : "جاري التحميل..."} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">الاسم القانوني</label>
                  <Input value={orgLegalName} onChange={(e) => setOrgLegalName(e.target.value)} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">المنطقة الزمنية</label>
                    <Input defaultValue={org?.timezone || ""} disabled />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">العملة</label>
                    <Input defaultValue={org?.currency || ""} disabled />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t mt-8">
                <Button onClick={saveOrganization} disabled={busy || !orgId || !orgLegalName.trim()}>تحديث بيانات المؤسسة</Button>
              </div>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-4">الإشعارات</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">رسائل جديدة</h3>
                    <p className="text-sm text-gray-500">إشعار عند وصول رسالة جديدة من العملاء</p>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-gold-600 rounded border-gray-300" defaultChecked />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h3 className="font-medium text-gray-900">حالة الذكاء الاصطناعي</h3>
                    <p className="text-sm text-gray-500">تنبيه عند توقف أو تعطل وكيل الذكاء الاصطناعي</p>
                  </div>
                  <input type="checkbox" className="w-4 h-4 text-gold-600 rounded border-gray-300" defaultChecked />
                </div>
              </div>
              <p className="text-xs text-gray-400">تُدار تفضيلات الإشعارات التفصيلية في تحديث قادم.</p>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-4">الأمان وكلمة المرور</h2>

              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">كلمة المرور الحالية</label>
                  <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">كلمة المرور الجديدة</label>
                  <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">تأكيد كلمة المرور الجديدة</label>
                  <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
                <Button className="mt-4" onClick={changePassword} disabled={busy || !currentPassword || !newPassword}>تغيير كلمة المرور</Button>
              </div>
            </div>
          )}

          {activeTab === "api" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 border-b pb-4">مفاتيح الربط البرمجي (API Keys)</h2>
              <div className="p-8 border rounded-lg bg-gray-50 text-center text-gray-500">
                <Key className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700">إدارة مفاتيح API قادمة قريباً</p>
                <p className="text-sm mt-1">حالياً يمكن الربط البرمجي عبر توثيق Swagger على <code dir="ltr">/api/docs</code></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
