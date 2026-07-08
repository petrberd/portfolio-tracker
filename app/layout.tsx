import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Sledování investičního portfolia z XTB",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
