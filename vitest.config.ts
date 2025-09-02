/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      exclude: ["src/frontend/App.tsx", "src/frontend/main.tsx"],
      include: ["src/**"],
      provider: "v8",
      reporter: ["text", "text-summary", "html", "json", "lcov"],
      reportsDirectory: "./coverage",
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
  },
});
