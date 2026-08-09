"use client";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      window.location.href = "/app/inbox";
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "خطأ في تسجيل الدخول");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-charcoal-900 flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-7 h-7 text-charcoal-900" />
          </div>
          <h1 className="text-2xl font-bold text-white">تسجيل الدخول</h1>
          <p className="text-gray-400 mt-1">أهلاً بك في QanoAI</p>
        </div>
        <form onSubmit={handleSubmit} className="bg-charcoal-800 border border-white/10 rounded-2xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">البريد الإلكتروني</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition"
              placeholder="you@company.com"
              dir="ltr"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-charcoal-900 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-gold-500 transition pr-10"
                placeholder="••••••••"
                dir="ltr"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-gold-500 text-charcoal-900 font-bold py-3 rounded-lg hover:bg-gold-400 transition disabled:opacity-50">
            {loading ? "جاري الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
        <p className="text-center text-gray-500 mt-6 text-sm">
          ما عندك حساب؟ <Link href="/register" className="text-gold-500 hover:text-gold-400">سجل الآن</Link>
        </p>
      </div>
    </div>
  );
}
