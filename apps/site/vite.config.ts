import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The panel runs on 5173; the site on 5174. Reachable from a phone on the same Wi-Fi.
  server: { port: 5174, host: true },
});
