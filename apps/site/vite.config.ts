import { existsSync } from "node:fs";
import { join } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/**
 * Dev only: "/termos/" and "/privacidade/" are static pages in public/. Production hosting serves
 * their index.html; the dev server would fall back to the landing page, so map them here.
 */
function publicFolderIndex(): Plugin {
  return {
    name: "public-folder-index",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = (req.url ?? "").split("?")[0] ?? "";
        const folder = path.replace(/^\/|\/$/g, "");
        if (folder && !folder.includes(".") && existsSync(join(server.config.publicDir, folder, "index.html"))) {
          req.url = `/${folder}/index.html`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicFolderIndex()],
  // The panel runs on 5173; the site on 5174. Reachable from a phone on the same Wi-Fi.
  server: { port: 5174, host: true },
});
