interface EvalBarProps {
  /** Probabilité (0-100) du joueur, vue de son côté. */
  wp: number | null;
  label?: string;
}

/** Barre d'avantage horizontale (mobile-first, DA bento). */
export default function EvalBar({ wp, label }: EvalBarProps) {
  const pct = wp === null ? 50 : Math.max(-50, Math.min(50, wp - 50));
  return (
    <div className="select-none">
      <div className="flex items-center gap-3">
        <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className="absolute inset-y-0 left-1/2 w-1/2 rounded-full bg-black/70"
            style={{ display: "none" }}
          />
          <div
            className="absolute inset-y-0 right-1/2 rounded-r-full bg-white/80 transition-all duration-300"
            style={{ width: `${Math.max(0, pct)}%`, right: "50%" }}
          />
          <div
            className="absolute inset-y-0 left-1/2 rounded-l-full bg-white/80 transition-all duration-300"
            style={{ width: `${Math.max(0, -pct)}%`, left: "50%" }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
        </div>
        {label !== undefined && (
          <span className="w-max shrink-0 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-xs tabular-nums text-muted">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}