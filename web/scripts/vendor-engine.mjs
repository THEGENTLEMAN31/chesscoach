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
  `// Le PWA peut servir les assets moteur depuis son cache : la réponse .wasm
// perd alors son Content-Type et instantiateStreaming échoue. On normalise
// la réponse wasm (Content-Type propre, suppression de length/encoding
// obsolètes) avant de laisser stockfish l'instancier.
{
  const _fetch = self.fetch.bind(self);
  self.fetch = (url, opts) =>
    _fetch(url, opts).then((r) => {
      const u = String(url instanceof Request ? url.url : url);
      if (u.includes(".wasm")) {
        const h = new Headers(r.headers);
        h.set("content-type", "application/wasm");
        h.delete("content-length");
        h.delete("content-encoding");
        return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
      }
      return r;
    });
}
importScripts("stockfish.js");
`,
);
console.log("[vendor-engine] stockfish.js + stockfish.wasm vitrinés dans public/engine/");