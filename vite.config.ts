import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: process.env.VITE_BASE_PATH || env.VITE_BASE_PATH || "/",
    plugins: [react()],
    server: { host: "127.0.0.1", port: 4173, strictPort: true, allowedHosts: ["host.docker.internal"] },
    preview: { host: "127.0.0.1", port: 4174, strictPort: true, allowedHosts: ["host.docker.internal"] },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
      coverage: { reporter: ["text", "json-summary"] }
    }
  };
});
