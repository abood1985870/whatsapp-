import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Two roles from one superfamily.
//   sans — the interface: Arabic and Latin, engineered rather than humanist.
//   mono — every machine-generated value: phone numbers, money, durations,
//          ids, timestamps. In a product built on phone numbers and halalas,
//          setting those in a proportional face is what reads as amateur.
const sans = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "QanoAI — دعم العملاء بالذكاء الاصطناعي",
  description: "منصة سعودية لإدارة محادثات واتساب ومكالمات العملاء بموظفين يعملون بالذكاء الاصطناعي.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Applied before paint so the console never flashes light for an
            agent who works in the dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("qano-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
