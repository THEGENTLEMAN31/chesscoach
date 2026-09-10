import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
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
writeFileSync(
  join(out, "worker.js"),
  `importScripts("stockfish.js");\n`,
);
console.log("[vendor-engine] stockfish.js + stockfish.wasm vitrinés dans public/engine/");