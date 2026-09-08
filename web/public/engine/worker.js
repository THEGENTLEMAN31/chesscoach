// Le PWA peut servir les assets moteur depuis son cache : la réponse .wasm
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
