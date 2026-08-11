"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Users, Search, Download, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function ContactsPage() {
  const { user, loading: authLoading } = useAuth();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  const orgId = user?.memberships?.[0]?.organizationId;

  const fetchContacts = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await api.get(`/contacts?organizationId=${orgId}&search=${search}`);
      setContacts(res.data.data.items || []);
    } catch (error) {
      console.error("Failed to fetch contacts", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !orgId) {
      setLoading(false);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [authLoading, orgId, search]);

  const handleExport = async () => {
    if (!orgId) return;
    try {
      window.open(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/v1"}/contacts/export?organizationId=${orgId}`, '_blank');
    } catch (error) {
      console.error("Failed to export contacts", error);
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content mb-2">جهات الاتصال</h1>
          <p className="text-muted text-sm">إدارة قاعدة بيانات عملائك وسجل تفاعلاتهم</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            تصدير CSV
          </Button>
          <Button variant="outline" className="gap-2">
            <Upload className="w-4 h-4" />
            استيراد
          </Button>
        </div>
      </div>

      <div className="bg-surface border rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-surface-2 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-faint" />
            <Input 
              placeholder="ابحث بالاسم أو رقم الهاتف..." 
              className="pr-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted">جاري التحميل...</div>
        ) : contacts.length === 0 ? (
          <div className="p-16 text-center text-muted flex flex-col items-center">
            <Users className="w-12 h-12 text-faint mb-4" />
            <p className="font-medium text-content">لا توجد جهات اتصال</p>
            <p className="text-sm mt-1">لم نتمكن من العثور على أية جهات اتصال تطابق بحثك.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-surface-2 border-b">
                <tr>
                  <th className="px-6 py-4 font-medium text-muted">الاسم</th>
                  <th className="px-6 py-4 font-medium text-muted">رقم الهاتف</th>
                  <th className="px-6 py-4 font-medium text-muted">المصدر</th>
                  <th className="px-6 py-4 font-medium text-muted">اللغة</th>
                  <th className="px-6 py-4 font-medium text-muted">تاريخ الإضافة</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-surface-2 transition-colors cursor-pointer">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-surface-2 rounded-full flex items-center justify-center text-muted font-bold text-xs">
                          {contact.name?.charAt(0) || "?"}
                        </div>
                        <span className="font-medium">{contact.name || "بدون اسم"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted" dir="ltr">{contact.primaryPhone}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-qano-50 dark:bg-qano-900 text-qano-700 dark:text-qano-300 border border-qano-200 dark:border-qano-800">
                        {contact.source}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted uppercase">{contact.language || "AR"}</td>
                    <td className="px-6 py-4 text-muted">
                      {new Date(contact.createdAt).toLocaleDateString("ar-SA")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
