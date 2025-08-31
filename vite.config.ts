import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "./index.html",
      },
    },
    sourcemap: true,
  },
  plugins: [preact()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  root: ".",
  server: {
    open: true,
    port: 3000,
  },
});
