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
      includeAssets: ["favicon.svg", "icon.svg"],
      manifest: {
        name: "ChessCoach",
        short_name: "ChessCoach",
        description: "Coach d'échecs personnel — local-first",
        lang: "fr",
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
        ],
      },
workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api/],
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