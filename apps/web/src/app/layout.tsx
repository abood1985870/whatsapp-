import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

const cairo = Cairo({ subsets: ["latin", "arabic"] });

export const metadata: Metadata = {
  title: "QanoAI WhatsAppSupport - دعم العملاء بالذكاء الاصطناعي",
  description: "منصة دعم العملاء عبر واتساب بالذكاء الاصطناعي",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className={cairo.className}>{children}</body>
    </html>
  );
}
