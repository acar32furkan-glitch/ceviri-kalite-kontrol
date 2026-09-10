import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Çeviri Kalite Kontrol | Furkan Acar",
  description: "AI destekli çeviri ve yerelleştirme kalite kontrol aracı.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
