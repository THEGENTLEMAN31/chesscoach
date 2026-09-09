import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icon.svg",
        "icon-maskable.svg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "pwa-maskable-512x512.png",
      ],
      manifest: {
        name: "ChessCoach",
        short_name: "ChessCoach",
        description: "Coach d'échecs personnel — local-first",
        lang: "fr",
        id: "/",
        theme_color: "#0B0E11",
        background_color: "#0B0E11",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "assets/**/*.{js,css,woff2,wasm}",
          "engine/worker.js",
          "engine/stockfish.js",
          "index.html",
          "favicon.svg",
          "icon.svg",
          "icon-maskable.svg",
          "manifest.webmanifest",
        ],
        // sql-wasm ≈ 650 ko précaché ; stockfish.wasm (7,3 Mo) est trop lourd
        // pour le precache d'installation → runtime CacheFirst (voir plus bas).
        maximumFileSizeToCacheInBytes: 1 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith("/engine/") &&
              url.pathname.endsWith(".wasm") &&
              request.method === "GET",
            handler: "CacheFirst",
            options: {
              cacheName: "engine-wasm",
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url, request }) =>
              url.origin === self.location.origin &&
              request.method === "GET" &&
              url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "chart-vendor": [
            "@visx/curve",
            "@visx/shape",
            "@visx/scale",
            "@visx/grid",
            "@visx/responsive",
            "d3-array",
            "d3-shape",
          ],
          motion: ["motion"],
          "chess-vendor": [
            "chess.js",
            "react-chessboard",
            "react-dnd",
            "react-dnd-html5-backend",
            "react-dnd-touch-backend",
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8010",
    },
  },
});