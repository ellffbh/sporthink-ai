import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "AI Reklam Platformu",
  description: "AI tabanlı dijital reklam performans yönetimi",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={`dark ${inter.variable}`}>
      <body className="min-h-screen text-foreground antialiased font-sans" style={{ background: "#070C18" }}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "bg-slate-900 border border-slate-700 text-slate-100",
              description: "text-slate-400",
            },
          }}
        />
      </body>
    </html>
  );
}
