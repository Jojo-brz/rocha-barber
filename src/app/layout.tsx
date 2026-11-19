import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PWAInstallBanner } from "@/components/pwa-install-banner";

export const metadata: Metadata = {
  title: "Barbearia Rocha",
  description:
    "Sistema interno mobile-first de gestão para barbearia com controle de PIN, caixa e agenda.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png", type: "image/png" },
    ],
    shortcut: ["/icon.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Barbearia Rocha",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#07090e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-[#07090e] text-slate-100 selection:bg-amber-500 selection:text-black">
        {children}
        <PWAInstallBanner />
      </body>
    </html>
  );
}
