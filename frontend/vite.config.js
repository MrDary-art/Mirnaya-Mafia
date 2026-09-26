import { defineConfig, searchForWorkspaceRoot } from "vite";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), realpathSync(fileURLToPath(new URL("./node_modules", import.meta.url)))] },
    proxy: {
      "/api": process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
    },
  },
});
