import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish", "bin");
const out = join(root, "public", "engine");

if (!existsSync(join(src, "stockfish-18-lite-single.js"))) {
  console.warn("[vendor-engine] stockfish non installé — skip");
  process.exit(0);
}

mkdirSync(out, { recursive: true });
copyFileSync(join(src, "stockfish-18-lite-single.js"), join(out, "stockfish.js"));
copyFileSync(join(src, "stockfish-18-lite-single.wasm"), join(out, "stockfish.wasm"));
// worker.js est COMMITTÉ (public/engine/worker.js) pour ne pas écraser le
// correctif PWA : sans lui, la réponse .wasm servie par le cache du service
// worker perd son Content-Type et instantiateStreaming échoue chez l'utilisateur.
// On ne le régénère pas ici (c'était `importScripts("stockfish.js");`).
console.log("[vendor-engine] stockfish.js + stockfish.wasm vitrinés dans public/engine/");