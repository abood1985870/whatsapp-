"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { MessageCircle, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try { await register(form); window.location.href = "/app/inbox"; } catch (err: any) { setError(err.response?.data?.error?.message || "خطأ في التسجيل"); }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-charcoal-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 text-charcoal-900" />
          </div>
          <h1 className="text-2xl font-bold text-white">إنشاء حساب جديد</h1>
          <p className="text-gray-400 mt-1">ابدأ تجربة مجانية لمدة 14 يوم</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-charcoal-800 border border-white/10 rounded-2xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">الاسم الكامل</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition" placeholder="محمد العلي" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">البريد الإلكتروني</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition" placeholder="you@company.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">اسم الشركة</label>
            <input type="text" value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} required className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition" placeholder="شركتك التجارية" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">كلمة المرور</label>
            <div className="relative">
              <input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition pr-10" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-gold-500 text-charcoal-900 font-bold py-3 rounded-lg hover:bg-gold-400 transition disabled:opacity-50">
            {loading ? "جاري التسجيل..." : "إنشاء الحساب"}
          </button>
        </form>
        <p className="text-center text-gray-500 mt-6 text-sm">
          عندك حساب؟ <Link href="/login" className="text-gold-500 hover:text-gold-400">سجل الدخول</Link>
        </p>
      </div>
    </div>
  );
}
