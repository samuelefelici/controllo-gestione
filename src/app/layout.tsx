import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart World BI — Business Intelligence",
  description: "Dashboard gestionale Smart World SRLS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
