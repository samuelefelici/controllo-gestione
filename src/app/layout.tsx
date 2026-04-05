import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controllo Gestione — FF Group",
  description: "Portale di controllo gestione per commercialisti",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
