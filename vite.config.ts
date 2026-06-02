import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "apps/desktop/src/renderer",
  base: "./",
  build: {
    outDir: "../../../../dist/renderer",
    emptyOutDir: true
  }
});
