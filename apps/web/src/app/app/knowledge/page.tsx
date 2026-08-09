"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { BookOpen, Plus, FileText, HelpCircle } from "lucide-react";

export default function KnowledgePage() {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"bases" | "faqs">("bases");
  const [bases, setBases] = useState<any[]>([]);
  const [faqs, setFaqs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [isAddBaseModalOpen, setIsAddBaseModalOpen] = useState(false);
  const [newBase, setNewBase] = useState({ name: "", description: "" });
  
  const [isAddFaqModalOpen, setIsAddFaqModalOpen] = useState(false);
  const [newFaq, setNewFaq] = useState({ question: "", answer: "" });

  const [docBase, setDocBase] = useState<any>(null);
  const [newDoc, setNewDoc] = useState({ name: "", content: "" });
  const [docBusy, setDocBusy] = useState(false);
  const [docFeedback, setDocFeedback] = useState<string | null>(null);

  const orgId = user?.memberships?.[0]?.organizationId;

  const fetchData = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      if (activeTab === "bases") {
        const res = await api.get(`/knowledge/bases?organizationId=${orgId}`);
        setBases(res.data.data || []);
      } else {
        const res = await api.get(`/knowledge/faq?organizationId=${orgId}`);
        setFaqs(res.data.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch knowledge data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !orgId) {
      setLoading(false);
      return;
    }
    fetchData();
  }, [authLoading, orgId, activeTab]);

  const handleAddBase = async () => {
    if (!newBase.name.trim()) return;
    try {
      await api.post("/knowledge/bases", { organizationId: orgId, ...newBase });
      setIsAddBaseModalOpen(false);
      setNewBase({ name: "", description: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to create base", error);
    }
  };

  const handleAddDocument = async () => {
    if (!docBase || !newDoc.name.trim() || !newDoc.content.trim()) return;
    setDocBusy(true);
    setDocFeedback(null);
    try {
      await api.post(`/knowledge/bases/${docBase.id}/documents`, { name: newDoc.name, content: newDoc.content });
      setDocFeedback("تمت إضافة المستند — جاري معالجته وفهرسته للذكاء الاصطناعي");
      setNewDoc({ name: "", content: "" });
      setTimeout(() => { setDocBase(null); setDocFeedback(null); fetchData(); }, 1800);
    } catch (error) {
      console.error("Failed to add document", error);
      setDocFeedback("فشلت إضافة المستند، حاول مرة أخرى");
    }
    setDocBusy(false);
  };

  const handleAddFaq = async () => {
    if (!newFaq.question.trim() || !newFaq.answer.trim()) return;
    try {
      await api.post("/knowledge/faq", { organizationId: orgId, ...newFaq });
      setIsAddFaqModalOpen(false);
      setNewFaq({ question: "", answer: "" });
      fetchData();
    } catch (error) {
      console.error("Failed to create faq", error);
    }
  };

  return (
    <div className="p-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">قاعدة المعرفة</h1>
          <p className="text-gray-500 text-sm">أضف معلومات مؤسستك ليقوم الذكاء الاصطناعي بالتعلم منها</p>
        </div>
        <Button onClick={() => activeTab === "bases" ? setIsAddBaseModalOpen(true) : setIsAddFaqModalOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          {activeTab === "bases" ? "إنشاء قاعدة جديدة" : "إضافة سؤال جديد"}
        </Button>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          className={`pb-4 px-6 font-medium text-sm transition-colors border-b-2 ${
            activeTab === "bases" ? "border-gold-500 text-gold-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("bases")}
        >
          قواعد المعرفة والمستندات
        </button>
        <button
          className={`pb-4 px-6 font-medium text-sm transition-colors border-b-2 ${
            activeTab === "faqs" ? "border-gold-500 text-gold-600" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
          onClick={() => setActiveTab("faqs")}
        >
          الأسئلة الشائعة (FAQ)
        </button>
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden min-h-[400px]">
        {loading ? (
          <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
        ) : activeTab === "bases" ? (
          bases.length === 0 ? (
            <div className="p-16 text-center text-gray-500 flex flex-col items-center">
              <BookOpen className="w-12 h-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-900">لا يوجد قواعد معرفة</p>
              <p className="text-sm mt-1">أنشئ قاعدة لرفع ملفات الـ PDF أو إدخال روابط موقعك.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
              {bases.map((base) => (
                <div key={base.id} className="border rounded-xl p-5 hover:shadow-md transition-shadow flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{base.name}</h3>
                      <p className="text-xs text-gray-500">
                        {new Date(base.createdAt).toLocaleDateString("ar-SA")}
                        {" · "}
                        {(base.sources?.length || 0)} مصدر
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 flex-1">{base.description}</p>
                  <Button variant="outline" size="sm" className="mt-4 gap-1 w-full" onClick={() => setDocBase(base)}>
                    <Plus className="w-3 h-3" />
                    إضافة مستند
                  </Button>
                </div>
              ))}
            </div>
          )
        ) : (
          faqs.length === 0 ? (
            <div className="p-16 text-center text-gray-500 flex flex-col items-center">
              <HelpCircle className="w-12 h-12 text-gray-300 mb-4" />
              <p className="font-medium text-gray-900">لا توجد أسئلة شائعة</p>
              <p className="text-sm mt-1">أضف الأسئلة الشائعة ليجيب عليها الذكاء الاصطناعي مباشرة.</p>
            </div>
          ) : (
            <div className="p-6 space-y-4">
              {faqs.map((faq) => (
                <div key={faq.id} className="border rounded-lg p-4 bg-gray-50/50">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-start gap-2">
                    <span className="text-gold-500 mt-1"><HelpCircle className="w-4 h-4" /></span>
                    {faq.question}
                  </h4>
                  <p className="text-gray-600 text-sm leading-relaxed mr-6">{faq.answer}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <Modal isOpen={isAddBaseModalOpen} onClose={() => setIsAddBaseModalOpen(false)} title="إنشاء قاعدة معرفة">
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم القاعدة</label>
            <Input 
              value={newBase.name} 
              onChange={(e) => setNewBase({...newBase, name: e.target.value})} 
              placeholder="مثال: سياسة الاسترجاع والضمان"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
            <textarea 
              className="w-full rounded-md border border-gray-200 p-3 text-sm min-h-[80px]"
              value={newBase.description} 
              onChange={(e) => setNewBase({...newBase, description: e.target.value})} 
              placeholder="وصف مختصر لمحتوى القاعدة..."
            />
          </div>
          <Button className="w-full" onClick={handleAddBase} disabled={!newBase.name.trim()}>
            إنشاء
          </Button>
        </div>
      </Modal>

      <Modal isOpen={!!docBase} onClose={() => { setDocBase(null); setDocFeedback(null); }} title={`إضافة مستند إلى: ${docBase?.name || ""}`}>
        <div className="space-y-4 pt-2">
          {docFeedback && (
            <div className={`px-3 py-2 rounded-lg text-sm ${docFeedback.startsWith("فشلت") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
              {docFeedback}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">عنوان المستند</label>
            <Input
              value={newDoc.name}
              onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
              placeholder="مثال: سياسة الشحن والتوصيل"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">المحتوى النصي</label>
            <textarea
              className="w-full rounded-md border border-gray-200 p-3 text-sm min-h-[180px]"
              value={newDoc.content}
              onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
              placeholder="الصق هنا نص المستند أو المعلومات التي تريد أن يتعلمها الذكاء الاصطناعي..."
            />
            <p className="text-xs text-gray-400 mt-1">رفع ملفات PDF/Word مباشرة سيتوفر في تحديث قادم — حالياً الصق المحتوى كنص.</p>
          </div>
          <Button className="w-full" onClick={handleAddDocument} disabled={docBusy || !newDoc.name.trim() || !newDoc.content.trim()}>
            {docBusy ? "جاري الإضافة..." : "إضافة ومعالجة"}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isAddFaqModalOpen} onClose={() => setIsAddFaqModalOpen(false)} title="إضافة سؤال شائع">
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السؤال</label>
            <Input 
              value={newFaq.question} 
              onChange={(e) => setNewFaq({...newFaq, question: e.target.value})} 
              placeholder="مثال: ما هي أوقات العمل؟"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">الإجابة</label>
            <textarea 
              className="w-full rounded-md border border-gray-200 p-3 text-sm min-h-[100px]"
              value={newFaq.answer} 
              onChange={(e) => setNewFaq({...newFaq, answer: e.target.value})} 
              placeholder="أوقات العمل لدينا هي من الأحد للخميس..."
            />
          </div>
          <Button className="w-full" onClick={handleAddFaq} disabled={!newFaq.question.trim() || !newFaq.answer.trim()}>
            إضافة السؤال
          </Button>
        </div>
      </Modal>
    </div>
  );
}
