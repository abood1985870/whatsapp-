"use client";
import { useEffect, useState } from "react";
import { Building2, CreditCard, MessageCircle, ShieldCheck, UserPlus, Users } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function isPlatformOwner(user: any) {
  return (user?.memberships || []).some(
    (membership: any) => membership.status === "ACTIVE" && membership.role?.name === "PLATFORM_SUPER_ADMIN"
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: any }) {
  return (
    <div className="bg-white border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="w-11 h-11 rounded-xl bg-gold-50 text-gold-700 flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-1">{title}</p>
      <p className="text-3xl font-bold text-gray-950">{value}</p>
    </div>
  );
}

export default function PlatformOwnerPage() {
  const { user, loading: authLoading } = useAuth();
  const [overview, setOverview] = useState<any>(null);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    organizationName: "",
    password: "QanoAI@2026!",
  });

  const platformOwner = isPlatformOwner(user);

  const loadPlatform = async () => {
    setLoading(true);
    try {
      const [overviewRes, orgsRes, subsRes] = await Promise.all([
        api.get("/platform/overview"),
        api.get("/platform/organizations"),
        api.get("/platform/subscriptions"),
      ]);
      setOverview(overviewRes.data.data);
      setOrganizations(orgsRes.data.data || []);
      setSubscriptions(subsRes.data.data || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && platformOwner) loadPlatform();
    if (!authLoading && !platformOwner) setLoading(false);
  }, [authLoading, platformOwner]);

  const createCustomer = async () => {
    setFeedback(null);
    try {
      await api.post("/platform/customers", form);
      setFeedback("تم إنشاء حساب العميل والمنظمة والاشتراك التجريبي بنجاح.");
      setForm({ name: "", email: "", organizationName: "", password: "QanoAI@2026!" });
      loadPlatform();
    } catch (error: any) {
      setFeedback(error?.response?.data?.error?.message || "تعذر إنشاء العميل. تأكد من البيانات وحاول مرة ثانية.");
    }
  };

  if (authLoading || loading) {
    return <div className="p-8 text-gray-500">جاري تحميل لوحة مالك المنصة...</div>;
  }

  if (!platformOwner) {
    return (
      <div className="p-8">
        <div className="bg-white border rounded-2xl p-8 text-center shadow-sm">
          <ShieldCheck className="w-12 h-12 mx-auto text-gray-300 mb-3" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">هذه الصفحة مخصصة لمالك المنصة</h1>
          <p className="text-gray-500">سجل الدخول بحساب مالك المنصة للوصول إلى الاشتراكات والعملاء.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <p className="text-sm text-gold-700 font-medium mb-2">لوحة تحكم المالك</p>
        <h1 className="text-3xl font-bold text-gray-950 mb-2">إدارة منصة QanoAI</h1>
        <p className="text-gray-500">عرض الاشتراكات، المنظمات، وإنشاء حسابات عملاء جديدة من مكان واحد.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
        <StatCard title="المنظمات" value={overview?.organizations || 0} icon={Building2} />
        <StatCard title="المستخدمون" value={overview?.users || 0} icon={Users} />
        <StatCard title="اشتراكات نشطة" value={overview?.activeSubscriptions || 0} icon={CreditCard} />
        <StatCard title="اشتراكات تجريبية" value={overview?.trialSubscriptions || 0} icon={ShieldCheck} />
        <StatCard title="اتصالات واتساب" value={overview?.whatsappConnections || 0} icon={MessageCircle} />
        <StatCard title="واتساب متصل" value={overview?.connectedWhatsApp || 0} icon={MessageCircle} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white border rounded-2xl shadow-sm p-6 xl:col-span-1">
          <div className="flex items-center gap-2 mb-5">
            <UserPlus className="w-5 h-5 text-gold-700" />
            <h2 className="font-bold text-gray-950">إنشاء عميل جديد</h2>
          </div>
          {feedback && <div className="mb-4 rounded-lg bg-gray-50 border px-3 py-2 text-sm text-gray-700">{feedback}</div>}
          <div className="space-y-3">
            <Input placeholder="اسم صاحب الحساب" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="إيميل العميل" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input placeholder="اسم الشركة / المنظمة" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} />
            <Input placeholder="كلمة مرور مؤقتة" dir="ltr" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button className="w-full gap-2" onClick={createCustomer}>
              <UserPlus className="w-4 h-4" />
              إنشاء الحساب
            </Button>
          </div>
        </div>

        <div className="bg-white border rounded-2xl shadow-sm overflow-hidden xl:col-span-2">
          <div className="p-6 border-b">
            <h2 className="font-bold text-gray-950">الاشتراكات</h2>
            <p className="text-sm text-gray-500 mt-1">آخر اشتراكات العملاء وخططهم.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-5 py-3 text-gray-500 font-medium">المنظمة</th>
                  <th className="px-5 py-3 text-gray-500 font-medium">الخطة</th>
                  <th className="px-5 py-3 text-gray-500 font-medium">الحالة</th>
                  <th className="px-5 py-3 text-gray-500 font-medium">نهاية الفترة</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subscriptions.map((subscription) => (
                  <tr key={subscription.id}>
                    <td className="px-5 py-3 font-medium">{subscription.organization?.displayName || subscription.organization?.legalName}</td>
                    <td className="px-5 py-3 text-gray-600">{subscription.plan?.name || "-"}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-gold-50 text-gold-700 px-2.5 py-1 text-xs font-medium">{subscription.status}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-500">{new Date(subscription.currentPeriodEnd).toLocaleDateString("ar-SA")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b">
          <h2 className="font-bold text-gray-950">المنظمات</h2>
          <p className="text-sm text-gray-500 mt-1">نظرة تشغيلية على كل عميل في المنصة.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-right">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-5 py-3 text-gray-500 font-medium">الاسم</th>
                <th className="px-5 py-3 text-gray-500 font-medium">الحالة</th>
                <th className="px-5 py-3 text-gray-500 font-medium">الأعضاء</th>
                <th className="px-5 py-3 text-gray-500 font-medium">واتساب</th>
                <th className="px-5 py-3 text-gray-500 font-medium">المحادثات</th>
                <th className="px-5 py-3 text-gray-500 font-medium">الاشتراك</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {organizations.map((org) => (
                <tr key={org.id}>
                  <td className="px-5 py-3 font-medium">{org.displayName || org.legalName}</td>
                  <td className="px-5 py-3 text-gray-600">{org.status}</td>
                  <td className="px-5 py-3 text-gray-600">{org._count?.memberships || 0}</td>
                  <td className="px-5 py-3 text-gray-600">{org._count?.channelConnections || 0}</td>
                  <td className="px-5 py-3 text-gray-600">{org._count?.conversations || 0}</td>
                  <td className="px-5 py-3 text-gray-600">{org.subscriptions?.[0]?.status || "بدون اشتراك"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
