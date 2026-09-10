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
    <div className="flex select-none flex-col items-center gap-1.5">
      <div className="relative h-32 w-3 overflow-hidden rounded-md bg-eval-down shadow-inner border border-line">
        <div
          className="absolute inset-x-0 bottom-0 bg-eval-up transition-all duration-300"
          style={{ height: `${p}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-ink/40 z-10" />
      </div>
      {label !== undefined && (
        <span className="w-12 shrink-0 rounded border border-line bg-surface-2 px-1 py-0.5 text-center text-[11px] tabular-nums text-ink font-medium">
          {label}
        </span>
      )}
    </div>
  );
}