import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import { uciScore, stmOf, toWhite, type EngineWorker } from "../lib/engine/engine";

interface Variant {
  uci: string;
  san: string;
  fen: string;
  cp: number | null;
}

interface VariantsPanelProps {
  fen: string;
  playerColor: string;
  engine: EngineWorker | null;
  engineReady: boolean;
  onPlay: (uci: string, san: string, fen: string) => void;
}

/** Meilleurs coups de la position (MultiPV), avec leur évaluation. */
export default function VariantsPanel({ fen, engine, engineReady, onPlay }: VariantsPanelProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!engine || !engineReady) {
        setVariants([]);
        return;
      }
      setLoading(true);
      try {
        const res = await engine.analyseMultiPv(fen, { depth: 12, movetime: 600 }, 6);
        if (cancelled || !res) return;
        const stm = stmOf(fen);
        const rows: Variant[] = [];
        for (const line of res.lines) {
          const uci = line.pv[0];
          if (!uci) continue;
          const c = new Chess(fen);
          let san = uci;
          let fenAfter = fen;
          try {
            const mv = c.move({
              from: uci.slice(0, 2) as Square,
              to: uci.slice(2, 4) as Square,
              promotion: uci.length >= 5 ? (uci[4] as "q" | "r" | "n" | "b") : undefined,
            });
            if (mv) {
              san = mv.san;
              fenAfter = c.fen();
            }
          } catch {
            /* coup invalide, on garde l'uci */
          }
          rows.push({ uci, san, fen: fenAfter, cp: toWhite(uciScore(line), stm) });
        }
        // trier par avantage pour le camp au trait (jaugé en perspective Blancs)
        rows.sort((a, b) => {
          const av = a.cp ?? -1e9;
          const bv = b.cp ?? -1e9;
          return stm === "w" ? bv - av : av - bv;
        });
        if (!cancelled) setVariants(rows.slice(0, 6));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [fen, engine, engineReady]);

  if (!engineReady || !engine) {
    return <p className="text-xs text-muted">Moteur indisponible.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">Meilleurs coups ({variants.length})</span>
      </div>
      {loading && variants.length === 0 ? (
        <p className="text-xs text-muted">Calcul des meilleurs coups…</p>
      ) : variants.length === 0 ? (
        <p className="text-xs text-muted">Aucun coup.</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {variants.map((v, i) => (
            <li key={v.uci}>
              <button
                onClick={() => onPlay(v.uci, v.san, v.fen)}
                className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left transition-colors hover:bg-surface-3 ${
                  i === 0 ? "border-accent/40 bg-accent/5" : "border-line bg-surface-2/60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-xs text-ink">{v.san}</span>
                  {i === 0 && (
                    <span className="ml-1.5 rounded bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
                      meilleur
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {v.cp != null ? `${v.cp >= 0 ? "+" : ""}${(v.cp / 100).toFixed(1)}` : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
