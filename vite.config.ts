import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig(({ command }) => ({
  base: "./",
  plugins: [react(), ...(command === "build" ? [viteSingleFile()] : [])],
  build: { target: "es2020", assetsInlineLimit: 100_000_000, cssCodeSplit: false },
  server: { port: 5179 },
}));
