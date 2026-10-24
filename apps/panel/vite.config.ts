import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The system version (same in every package.json), shown at the bottom of the menu.
const { version } = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits for the "Atualizar" click (components/update-prompt.tsx), registered there.
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Chama Lia",
        short_name: "Chama Lia",
        description: "Agenda e atendimento no WhatsApp",
        lang: "pt-BR",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#0b0f19",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // API calls always go to the network; only the app shell is cached.
        navigateFallbackDenylist: [/^\/api\//, /^\/webhooks\//, /^\/health/],
      },
    }),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Reachable from a phone on the same Wi-Fi (http://<PC IP>:5173).
    host: true,
    // Demo through a Cloudflare Tunnel (quick tunnel or app.chamalia.com.br).
    allowedHosts: [".trycloudflare.com", "app.chamalia.com.br"],
    // In dev the panel runs on :5173 and forwards API calls to the bot on :3000.
    proxy: {
      "/api": "http://localhost:3000",
      "/health": "http://localhost:3000",
    },
  },
});
