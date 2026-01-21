import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    rollupOptions: {
      external: [
        "@tauri-apps/api/fs",
        "@tauri-apps/api/path",
        "@tauri-apps/api/tauri",
        "@tauri-apps/api/dialog",
      ],
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.png", "robots.txt"],
      manifest: {
        name: "Tech & Electrical Services",
        short_name: "TES",
        description: "Business management for Tech & Electrical Services",
        theme_color: "#1e40af",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          {
            src: "/favicon.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/favicon.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // Ensure the newest service worker takes control quickly (important for update flows)
        skipWaiting: true,
        clientsClaim: true,
        // Allow caching of larger JS bundles (default is 2 MiB)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Never cache version.json; it must always reflect the currently deployed build
        runtimeCaching: [
          {
            urlPattern: /\/version\.json(\?.*)?$/,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
