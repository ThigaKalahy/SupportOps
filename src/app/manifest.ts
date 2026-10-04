import type { MetadataRoute } from "next"

import { labels } from "@/lib/labels"

/**
 * Instalação como atalho na tela inicial (P18). SÓ o manifest: sem service
 * worker, sem cache offline, sem sincronização — o app precisa da rede e do
 * login como sempre.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: labels.app.name,
    short_name: labels.app.name,
    description: labels.app.description,
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbfbfc",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
