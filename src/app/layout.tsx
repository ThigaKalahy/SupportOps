import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import { labels } from "@/lib/labels";

import "./globals.css";

// "latin" é obrigatório junto com "latin-ext": o subset latin-ext do Google
// não contém ASCII básico, e sem "latin" o texto cairia na fonte do sistema.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: labels.app.name,
  description: labels.app.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
