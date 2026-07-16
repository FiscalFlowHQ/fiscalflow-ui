/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const apiProxy = {
  target: "http://localhost:8000",
  changeOrigin: true,
} as const;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
    proxy: {
      // Legacy audit client (dead API — keep compiling until task 15)
      "/api": apiProxy,
      // fiscalflow-api REST surface (task 02+)
      "/sessions": apiProxy,
      "/documents": apiProxy,
      "/health": apiProxy,
      "/settings": apiProxy,
      "/sections": apiProxy,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
});
