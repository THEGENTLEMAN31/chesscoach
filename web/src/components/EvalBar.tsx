interface EvalBarProps {
  /** Évaluation en centipawns du point de vue des Blancs. Positif = avantage Blancs. */
  cp: number | null;
  /** Hauteur de la barre en px. */
  height?: number;
  /** Label optionnel (ex: "+1.5", "M4"). */
  label?: string;
}

export default function EvalBar({ cp, height, label }: EvalBarProps) {
  // cp = centipawns du point de vue des Blancs. +100 = 1 pion d'avantage aux Blancs.
  // On mappe sur 0-100% : 0 = -500cp (Noirs gagnants), 50 = 0cp (égal), 100 = +500cp (Blancs gagnants)
  const MAX_CP = 500;
  const p = cp === null ? 50 : Math.max(0, Math.min(100, 50 + (cp / MAX_CP) * 50));

  const fmtLabel = label ?? (cp === null ? "—" : `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(1)}`);

  return (
    <div
      className={`flex select-none flex-col items-center gap-1 ${height ? "" : "h-full"}`}
      style={height ? { height } : undefined}
    >
      <div
        className="relative flex-1 w-4 overflow-hidden rounded border border-line-strong shadow-sm"
        style={{ backgroundColor: "var(--eval-black)" }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={cp === null ? undefined : p}
        aria-label={label ?? "Avantage"}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-200"
          style={{ backgroundColor: "var(--eval-white)", height: `${p}%` }}
        />
        <div className="absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-amber-400/80" />
      </div>
      {label !== undefined && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted font-medium">
          {fmtLabel}
        </span>
      )}
    </div>
  );
}