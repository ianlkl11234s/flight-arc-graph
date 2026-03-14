import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "fs";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-large-json",
      configureServer(server) {
        // Serve large JSON files from public/ before SPA fallback kicks in
        server.middlewares.use((req, res, next) => {
          if (req.url?.endsWith(".json")) {
            const filePath = path.join(__dirname, "public", req.url);
            if (fs.existsSync(filePath)) {
              res.setHeader("Content-Type", "application/json");
              fs.createReadStream(filePath).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  assetsInclude: ["**/*.vert", "**/*.frag"],
});
