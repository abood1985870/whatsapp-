"use client";
import Link from "next/link";
import { MessageCircle, Bot, BarChart3, Shield, ArrowLeft } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-charcoal-900 to-charcoal-800 text-white">
      {/* Navbar */}
      <nav className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gold-500 rounded-lg flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-charcoal-900" />
            </div>
            <span className="font-bold text-xl">QanoAI</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-gray-300 hover:text-white transition">تسجيل الدخول</Link>
            <Link href="/register" className="bg-gold-500 text-charcoal-900 px-4 py-2 rounded-lg font-medium text-sm hover:bg-gold-400 transition">ابدأ مجاناً</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-32 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            دعم عملاء ذكي عبر <span className="text-gold-500">واتساب</span>
          </h1>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            اربط واتساب بشركتك، درّب الذكاء الاصطناعي على معلوماتك، واتركه يجيب على استفسارات العملاء تلقائياً
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-gold-500 text-charcoal-900 px-8 py-3 rounded-xl font-bold text-lg hover:bg-gold-400 transition flex items-center justify-center gap-2">
              ابدأ تجربة مجانية <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link href="/login" className="border border-white/20 px-8 py-3 rounded-xl font-medium text-lg hover:bg-white/5 transition">
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-charcoal-800/50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard icon={<Bot className="w-8 h-8" />} title="ذكاء اصطناعي متقدم" description="يجيب على الأسئلة المتكررة ويحوّل المحادثات المعقدة للموظفين تلقائياً" />
            <FeatureCard icon={<MessageCircle className="w-8 h-8" />} title="ربط واتساب بالـ QR" description="امسح QR code واربط رقم واتساب بشركتك في دقائق" />
            <FeatureCard icon={<BarChart3 className="w-8 h-8" />} title="تحليلات وإحصائيات" description="تتبع أداء فريقك، رضا العملاء، ومدى فعالية الذكاء الاصطناعي" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          © 2024 QanoAI. جميع الحقوق محفوظة.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-charcoal-800 border border-white/10 rounded-2xl p-6 hover:border-gold-500/30 transition">
      <div className="text-gold-500 mb-4">{icon}</div>
      <h3 className="text-xl font-bold mb-2">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  );
}
