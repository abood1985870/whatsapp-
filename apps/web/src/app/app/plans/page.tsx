"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, AlertTriangle, TrendingDown, Settings2, Plus } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";

function isPlatformOwner(user: any) {
  return (user?.memberships || []).some((m: any) => m.status === "ACTIVE" && m.role?.name === "PLATFORM_SUPER_ADMIN");
}

function num(v: any) {
  return v === "" || v === null || v === undefined ? undefined : Number(v);
}

export default function PlansManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const platformOwner = isPlatformOwner(user);
  const [plans, setPlans] = useState<any[]>([]);
  const [margins, setMargins] = useState<Record<string, any>>({});
  const [cost, setCost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [toast, setToast] = useState("");

  const load = async () => {
    setLoading(true);
    const [plansRes, marginRes, costRes] = await Promise.all([
      api.get("/plans/all"),
      api.get("/pricing/margin-report"),
      api.get("/pricing/cost-config"),
    ]);
    setPlans(plansRes.data?.data || []);
    const byId: Record<string, any> = {};
    for (const m of marginRes.data?.data || []) byId[m.planId] = m;
    setMargins(byId);
    setCost(costRes.data?.data);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && platformOwner) load();
    if (!authLoading && !platformOwner) setLoading(false);
  }, [authLoading, platformOwner]);

  const openEdit = (plan: any) => {
    setEditing(plan.id);
    setForm({
      name: plan.name, tagline: plan.tagline || "", badge: plan.badge || "", sortOrder: plan.sortOrder,
      isActive: plan.isActive, isPublic: plan.isPublic, priceAmount: plan.priceAmount / 100,
      messagesIncluded: plan.messagesIncluded ?? "", usersIncluded: plan.usersIncluded ?? "",
      features: (plan.features || []).join("\n"),
    });
  };

  const save = async () => {
    await api.patch(`/plans/${editing}`, {
      name: form.name, tagline: form.tagline, badge: form.badge || null, sortOrder: num(form.sortOrder),
      isActive: form.isActive, isPublic: form.isPublic,
      priceAmount: form.priceAmount !== "" ? Math.round(Number(form.priceAmount) * 100) : undefined,
      messagesIncluded: num(form.messagesIncluded), usersIncluded: num(form.usersIncluded),
      features: String(form.features || "").split("\n").map((s: string) => s.trim()).filter(Boolean),
    });
    setEditing(null);
    setToast("تم حفظ الباقة.");
    load();
  };

  const saveCost = async () => {
    await api.patch("/pricing/cost-config", cost);
    setToast("تم حفظ إعدادات التكلفة.");
    load();
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

  return (
    <div className="p-8 space-y-8">
      <div>
        <p className="text-sm text-qano-700 dark:text-qano-300 font-medium mb-2">لوحة تحكم المالك</p>
        <h1 className="text-3xl font-bold text-content">إدارة الباقات والتسعير</h1>
      </div>

      {toast && <div className="rounded-lg bg-surface-2 border px-4 py-2.5 text-sm text-content">{toast}</div>}

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const m = margins[plan.id];
          return (
            <div key={plan.id} className="bg-surface border rounded-lg shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-bold text-content">{plan.name}</p>
                  <p className="text-xs text-muted mt-0.5">{plan.tagline}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => openEdit(plan)}>
                  <Settings2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="mt-3 text-xl font-bold text-content num">{(plan.priceAmount / 100).toLocaleString("ar-SA")} <span className="text-xs font-normal text-muted">ريال/شهر</span></p>
              <p className="text-xs text-muted num">{plan.messagesIncluded?.toLocaleString("ar-SA")} رسالة</p>
              <div className="mt-3 flex gap-2 text-xs">
                <span className={`px-2 py-0.5 rounded-full ${plan.isActive ? "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300" : "bg-surface-2 text-muted"}`}>{plan.isActive ? "مفعّلة" : "معطّلة"}</span>
                <span className={`px-2 py-0.5 rounded-full ${plan.isPublic ? "bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300" : "bg-surface-2 text-muted"}`}>{plan.isPublic ? "ظاهرة" : "مخفية"}</span>
              </div>

              {m && (
                <div className="mt-4 pt-4 border-t text-xs space-y-1.5">
                  <div className="flex justify-between"><span className="text-muted">هامش الربح المقدّر</span><span className="font-medium text-content num">{m.grossMarginPercent.toFixed(0)}%</span></div>
                  <div className="flex justify-between"><span className="text-muted">تكلفة كل 1000 رسالة</span><span className="font-medium text-content num">{m.costPer1000Messages.toFixed(2)} ريال</span></div>
                  {m.isLoss && (
                    <p className="flex items-center gap-1.5 text-danger-600 dark:text-danger-400 mt-2"><TrendingDown className="w-3.5 h-3.5" /> تحذير: هذه الباقة قد تسبب خسارة.</p>
                  )}
                  {!m.isLoss && m.isBelowTargetMargin && (
                    <p className="flex items-center gap-1.5 text-alert-600 dark:text-alert-400 mt-2"><AlertTriangle className="w-3.5 h-3.5" /> هامش ربح أقل من الحد المستهدف ({m.targetGrossMarginPercent}%).</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {cost && (
        <div className="bg-surface border rounded-lg shadow-sm p-6 max-w-2xl">
          <h2 className="font-bold text-content mb-1">إعدادات التكلفة والهامش</h2>
          <p className="text-sm text-muted mb-5">تُستخدم هذه القيم لحساب تحذيرات الربحية أعلاه.</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              ["whatsappCostPerMessage", "تكلفة واتساب / رسالة"],
              ["aiCostPerMessage", "تكلفة الذكاء الاصطناعي / رسالة"],
              ["infrastructureCost", "تكلفة البنية التحتية"],
              ["databaseCost", "تكلفة قاعدة البيانات"],
              ["storageCost", "تكلفة التخزين"],
              ["providerCost", "تكلفة المزوّد"],
              ["supportCost", "تكلفة الدعم المقدّرة"],
              ["otherVariableCost", "تكاليف متغيرة أخرى"],
              ["safetyBufferPercent", "هامش أمان %"],
              ["targetGrossMarginPercent", "هامش الربح المستهدف %"],
            ].map(([key, label]) => (
              <Field key={key} label={label} htmlFor={key}>
                <Input id={key} type="number" step="0.01" value={cost[key] ?? 0} onChange={(e) => setCost({ ...cost, [key]: Number(e.target.value) })} dir="ltr" className="text-start num" />
              </Field>
            ))}
          </div>
          <Button className="mt-5" onClick={saveCost}>حفظ إعدادات التكلفة</Button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/50 p-4" onClick={() => setEditing(null)}>
          <div className="bg-surface border rounded-lg shadow-pop max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-content mb-4">تعديل الباقة</h2>
            <div className="space-y-3">
              <Field label="الاسم" htmlFor="name"><Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="الوصف المختصر" htmlFor="tagline"><Input id="tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} /></Field>
              <Field label="Badge (اختياري)" htmlFor="badge"><Input id="badge" value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} /></Field>
              <Field label="السعر الشهري (ريال)" htmlFor="price"><Input id="price" type="number" dir="ltr" className="text-start" value={form.priceAmount} onChange={(e) => setForm({ ...form, priceAmount: e.target.value })} /></Field>
              <Field label="عدد الرسائل المشمولة" htmlFor="msgs"><Input id="msgs" type="number" dir="ltr" className="text-start" value={form.messagesIncluded} onChange={(e) => setForm({ ...form, messagesIncluded: e.target.value })} /></Field>
              <Field label="عدد المستخدمين المشمول" htmlFor="users"><Input id="users" type="number" dir="ltr" className="text-start" value={form.usersIncluded} onChange={(e) => setForm({ ...form, usersIncluded: e.target.value })} /></Field>
              <Field label="ترتيب الظهور" htmlFor="sort"><Input id="sort" type="number" dir="ltr" className="text-start" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
              <Field label="المميزات (سطر لكل ميزة)" htmlFor="features">
                <textarea id="features" className="w-full rounded border border-line-strong bg-bg px-3 py-2 text-label min-h-[100px]" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} />
              </Field>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-label text-content">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} /> مفعّلة
                </label>
                <label className="flex items-center gap-2 text-label text-content">
                  <input type="checkbox" checked={form.isPublic} onChange={(e) => setForm({ ...form, isPublic: e.target.checked })} /> ظاهرة للعملاء
                </label>
              </div>
            </div>
            <Button className="w-full mt-5" onClick={save}>حفظ</Button>
          </div>
        </div>
      )}
    </div>
  );
}
