"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { BarChart3, TrendingUp, Users, MessageSquare, Clock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

function WeeklyBarChart({ title, data, barClass }: { title: string; data: { label: string; value: number }[]; barClass: string }) {
  const max = Math.max(1, ...data.map(d => d.value));
  return (
    <div className="bg-white border rounded-xl shadow-sm p-6 h-80 flex flex-col">
      <h3 className="font-medium text-gray-900 mb-4">{title}</h3>
      <div className="flex-1 flex items-end justify-between gap-2">
        {data.map((d) => (
          <div key={d.label} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
            <span className="text-xs text-gray-600 font-medium">{d.value}</span>
            <div
              className={`w-full max-w-10 rounded-t-md ${barClass} transition-all`}
              style={{ height: `${Math.max(4, (d.value / max) * 100)}%`, opacity: d.value === 0 ? 0.15 : 1 }}
            />
            <span className="text-[10px] text-gray-400" dir="ltr">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  const orgId = user?.memberships?.[0]?.organizationId;

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!orgId) return;
      try {
        setLoading(true);
        const res = await api.get(`/analytics/dashboard?organizationId=${orgId}`);
        setDashboardData(res.data.data);
      } catch (error) {
        console.error("Failed to fetch analytics", error);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, [orgId]);

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">التحليلات والأداء</h1>
          <p className="text-gray-500 text-sm">نظرة شاملة على أداء فريق الدعم والذكاء الاصطناعي</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={async () => {
          try {
            const res = await api.get(`/analytics/export?organizationId=${orgId}&type=dashboard`);
            const csv = typeof res.data?.data === "string" ? res.data.data : String(res.data);
            const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "qanoai-report.csv";
            a.click();
          } catch (err) { console.error("Export failed", err); }
        }}>
          <Download className="w-4 h-4" />
          تصدير التقرير
        </Button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
      ) : dashboardData ? (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">إجمالي المحادثات</h3>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.totalConversations || 0}</p>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-green-50 text-green-600 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">العملاء النشطين</h3>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.activeContacts || 0}</p>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-gold-50 text-gold-600 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">تحويلات لموظف بشري</h3>
              <p className="text-3xl font-bold text-gray-900">{dashboardData.handoffCount || 0}</p>
            </div>

            <div className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
              <h3 className="text-gray-500 text-sm font-medium mb-1">معدل الحل</h3>
              <p className="text-3xl font-bold text-gray-900">{`${dashboardData.resolutionRate || 0}%`}</p>
            </div>
          </div>

          {/* Charts: last 7 days */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <WeeklyBarChart
              title="حجم المحادثات (آخر 7 أيام)"
              data={(dashboardData.daily || []).map((d: any) => ({ label: d.date.slice(5), value: d.conversations }))}
              barClass="bg-gold-500"
            />
            <WeeklyBarChart
              title="ردود الذكاء الاصطناعي (آخر 7 أيام)"
              data={(dashboardData.daily || []).map((d: any) => ({ label: d.date.slice(5), value: d.aiReplies }))}
              barClass="bg-blue-500"
            />
          </div>
        </div>
      ) : (
        <div className="p-16 text-center text-gray-500 flex flex-col items-center border bg-white rounded-lg shadow-sm">
          <BarChart3 className="w-12 h-12 text-gray-300 mb-4" />
          <p className="font-medium text-gray-900">لا توجد بيانات تحليلية بعد</p>
          <p className="text-sm mt-1">بمجرد بدء استقبال المحادثات من عملائك، ستظهر التحليلات هنا.</p>
        </div>
      )}
    </div>
  );
}
