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
      <div className="relative h-28 w-2 overflow-hidden rounded-full bg-eval-down/85">
        <div
          className="absolute inset-x-0 bottom-0 bg-eval-up/90 transition-all duration-300 rounded-b-full"
          style={{ height: `${p}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line opacity-50" />
      </div>
      {label !== undefined && (
        <span className="w-10 shrink-0 rounded border border-line bg-surface-2 px-0.5 py-0.5 text-center text-[10px] tabular-nums text-muted">
          {label}
        </span>
      )}
    </div>
  );
}