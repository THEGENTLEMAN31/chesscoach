interface EvalBarProps {
  /** Probabilité (0-100) du joueur, vue de son côté. */
  wp: number | null;
  label?: string;
}

/** Jauge d'avantage verticale (droite de l'échiquier).
 * Montée = avantage joueur, descente = désavantage ; centre = 50/50. */
export default function EvalBar({ wp, label }: EvalBarProps) {
  const norm = wp === null ? 50 : Math.max(-50, Math.min(50, wp - 50));
  const fillPct = Math.abs(norm);
  const up = norm >= 0;
  return (
    <div className="flex select-none flex-col items-center gap-1.5">
      <span className="text-[10px] font-semibold text-muted">+</span>
      <div className="relative h-28 w-3 overflow-hidden rounded-full bg-surface-3">
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
      <span className="text-[10px] font-semibold text-muted">−</span>
      {label !== undefined && (
        <span className="w-14 shrink-0 rounded-md border border-line bg-surface-2 px-1 py-0.5 text-center text-[10px] tabular-nums text-muted">
          {label}
        </span>
      )}
    </div>
  );
}