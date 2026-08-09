import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [react()],
  server: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts: ["host.docker.internal"] },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true, allowedHosts: ["host.docker.internal"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: { reporter: ["text", "json-summary"] }
  }
});
