interface EvalBarProps {
  /** Probabilité (0-100) du joueur, vue de son côté. */
  wp: number | null;
  label?: string;
}

/** Jauge d'avantage verticale fine (droite de l'échiquier), style Lichess.
 * Montée = avantage joueur, descente = désavantage ; centre = 50/50. */
export default function EvalBar({ wp, label }: EvalBarProps) {
  const norm = wp === null ? 50 : Math.max(-50, Math.min(50, wp - 50));
  const fillPct = Math.abs(norm);
  const up = norm >= 0;
  return (
    <div className="flex select-none flex-col items-center gap-1">
      <div className="relative h-24 w-1.5 overflow-hidden rounded-full bg-surface-3">
        {fillPct > 0 && (
          <div
            className={`absolute w-full transition-all duration-300 ${
              up ? "rounded-t-full bg-eval-up/85" : "rounded-b-full bg-eval-down/85"
            }`}
            style={
              up
                ? { bottom: "50%", height: `${fillPct}%` }
                : { top: "50%", height: `${fillPct}%` }
            }
          />
        )}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
      </div>
      {label !== undefined && (
        <span className="w-9 shrink-0 rounded border border-line bg-surface-2 px-0.5 py-0.5 text-center text-[10px] tabular-nums text-muted">
          {label}
        </span>
      )}
    </div>
  );
}