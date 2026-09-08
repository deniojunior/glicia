import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: "Glicia",
        short_name: "Glicia",
        description: "Contagem de carboidratos com confirmação humana e cálculo local.",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#e7f3ff",
        theme_color: "#0b2d6b",
        icons: [
          {
            src: "/icons/glicia-192-v5.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/glicia-512-v5.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/icons/glicia-512-v5.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html"
      }
    })
  ],
  test: {
    environment: "node"
  }
});
