interface EvalBarProps {
  /** Probabilité (0-100) du joueur, vue de son côté. */
  wp: number | null;
  label?: string;
}

/** Jauge d'avantage verticale fine (droite de l'échiquier), style Lichess.
 * Montée = avantage joueur, descente = désavantage ; centre = 50/50. */
export default function EvalBar({ wp, label }: EvalBarProps) {
  const p = wp === null ? 50 : Math.max(0, Math.min(100, wp));
  return (
    <div className="flex select-none flex-col items-center gap-1">
      <div className="relative h-28 w-2.5 overflow-hidden rounded bg-zinc-800 shadow-inner border border-line">
        <div
          className="absolute inset-x-0 bottom-0 bg-zinc-100 transition-all duration-300"
          style={{ height: `${p}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-500 z-10" />
      </div>
      {label !== undefined && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted font-medium">
          {label}
        </span>
      )}
    </div>
  );
}