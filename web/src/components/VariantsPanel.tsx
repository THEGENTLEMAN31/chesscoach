import { useEffect, useState } from "react";
import { Chess, type Square } from "chess.js";
import type { EngineWorker } from "../lib/engine/engine";
import { playerWinProb } from "../lib/game/eval";

interface Variant {
  uci: string;
  san: string;
  fen: string;
  cp: number | null;
  winprob: number | null;
}

interface VariantsPanelProps {
  fen: string;
  playerColor: string;
  engine: EngineWorker | null;
  engineReady: boolean;
  onPlay: (uci: string, san: string, fen: string) => void;
}

/** Liste les coups légaux de la position et leur évaluation moteur. */
export default function VariantsPanel({ fen, playerColor, engine, engineReady, onPlay }: VariantsPanelProps) {
  const [baseCp, setBaseCp] = useState<number | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<"cp" | "winprob">("cp");

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, engineReady, engine]);

  const refresh = async () => {
    setLoading(true);
    try {
      let legal: { uci: string; san: string; fen: string }[] = [];
      try {
        const b = new Chess(fen);
        legal = b.moves({ verbose: true }).map((m) => {
          const played = tryAll(b, m);
          return {
            uci: m.from + m.to + (m.promotion ?? ""),
            san: m.san,
            fen: played ?? b.fen(),
          };
        });
      } catch {
        legal = [];
      }
      if (!engine || !engineReady || legal.length === 0) {
        setBaseCp(null);
        setVariants([]);
        return;
      }
      const base = await engine.evalFen(fen, { movetime: 250, depth: 10 });
      setBaseCp(base?.cp ?? null);
      const out: Variant[] = [];
      const MAX_EVAL = 24;
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        let cp: number | null = null;
        if (i < MAX_EVAL) {
          const r = await engine.evalFen(m.fen, { movetime: 200, depth: 9 });
          cp = r?.cp ?? null;
        }
        out.push({
          uci: m.uci,
          san: m.san,
          fen: m.fen,
          cp,
          winprob: cp != null ? playerWinProb({ cp, mate: null }, playerColor) : null,
        });
      }
      setVariants(out);
    } finally {
      setLoading(false);
    }
  };

  const sorted = [...variants].sort((a, b) => {
    const av = sortBy === "cp" ? (a.cp ?? -1e9) : (a.winprob ?? -1e9);
    const bv = sortBy === "cp" ? (b.cp ?? -1e9) : (b.winprob ?? -1e9);
    return bv - av;
  });

  if (!engineReady || !engine) {
    return <p className="text-xs text-muted">Moteur indisponible.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">Variantes ({sorted.length})</span>
        <div className="flex items-center gap-1 rounded-md border border-line bg-surface-2 p-0.5">
          {(["cp", "winprob"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setSortBy(k)}
              className={`rounded px-2 py-0.5 text-[10px] ${sortBy === k ? "bg-accent text-accent-ink" : "text-muted"}`}
            >
              {k === "cp" ? "Éval" : "Proba"}
            </button>
          ))}
        </div>
      </div>
      {loading && sorted.length === 0 ? (
        <p className="text-xs text-muted">Calcul des variantes…</p>
      ) : sorted.length === 0 ? (
        <p className="text-xs text-muted">Aucun coup légal.</p>
      ) : (
        <ul className="max-h-72 flex flex-col gap-0.5 overflow-y-auto">
          {sorted.map((v) => {
            const delta = v.cp != null && baseCp != null ? v.cp - baseCp : null;
            return (
              <li key={v.uci} className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2/60 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <span className="truncate text-xs text-ink">{v.san}</span>
                  {delta != null && (
                    <span className={`ml-1 text-[10px] ${delta >= 0 ? "text-accent" : "text-red-400"}`}>
                      {delta >= 0 ? "+" : ""}
                      {(delta / 100).toFixed(1)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-muted">
                    {v.cp != null ? `${v.cp >= 0 ? "+" : ""}${(v.cp / 100).toFixed(1)}` : "—"}
                  </span>
                  <button
                    onClick={() => onPlay(v.uci, v.san, v.fen)}
                    className="rounded-md border border-line px-2 py-0.5 text-[10px] text-accent hover:bg-surface-3"
                  >
                    Jouer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Petit helper : rejouer le coup sur une copie pour obtenir la FEN. */
function tryAll(b: Chess, m: { from: Square; to: Square; promotion?: string }): string | null {
  try {
    const c = new Chess(b.fen());
    const mv = c.move({ from: m.from, to: m.to, promotion: m.promotion as "q" | "r" | "n" | "b" | undefined });
    return mv ? c.fen() : null;
  } catch {
    return null;
  }
}