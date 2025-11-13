import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@/components": path.resolve(import.meta.dirname, "client", "src", "components"),
      "@/components/ui": path.resolve(import.meta.dirname, "client", "src", "components", "ui"),
      "@/hooks": path.resolve(import.meta.dirname, "client", "src", "hooks"),
      "@/pages": path.resolve(import.meta.dirname, "client", "src", "pages"),
      "@/types": path.resolve(import.meta.dirname, "client", "src", "types"),
      "@/lib": path.resolve(import.meta.dirname, "client", "src", "lib"),
      "@/assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      external: [],
    },
    assetsDir: "assets",
    assetsInlineLimit: 0,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
});