import { defineConfig } from "vite";

export default defineConfig({
  base: "/shuai-v-bike-atelier/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    chunkSizeWarningLimit: 900,
  },
});
