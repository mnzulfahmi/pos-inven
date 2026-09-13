import type { Metadata } from "next";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/plus-jakarta-sans/800.css";
import "./globals.css";
import { BusinessProvider } from "@/components/business-provider";
import { Workspace } from "@/components/workspace";

export const metadata: Metadata = {
  title: { default: "Nusa — Ruang tumbuh usahamu", template: "%s | Nusa" },
  description:
    "Kelola penjualan, persediaan, pembelian, dan laporan usaha ritel Indonesia bersama asisten Nusa AI.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <body>
        <BusinessProvider>
          <Workspace>{children}</Workspace>
        </BusinessProvider>
      </body>
    </html>
  );
}
