import type { PlyOut } from "../lib/types";
import { CLASS_COLOR, CLASS_LABEL, formatClock } from "../lib/constants";

interface Props {
  plies: PlyOut[];
  selectedPly: number;
  onSelect: (ply: number) => void;
}

function PlyItem({ p, selected, onSelect }: { p: PlyOut; selected: boolean; onSelect: () => void }) {
  const clsColor =
    p.classification && p.classification !== "book"
      ? CLASS_COLOR[p.classification]
      : null;
  return (
    <button
      onClick={onSelect}
      title={`${p.san ?? ""} — ${p.classification ? (CLASS_LABEL[p.classification] ?? p.classification) : ""}`}
      className={`relative rounded-md px-2 py-1 text-[13px] font-medium tabular-nums transition-colors ${
        selected
          ? "bg-accent/15 text-accent ring-1 ring-accent/40"
          : "text-ink hover:bg-surface-3"
      }`}
    >
      {clsColor && (
        <span
          className="absolute inset-y-1 left-1 w-0.5 rounded-full"
          style={{ backgroundColor: clsColor }}
          aria-hidden
        />
      )}
      <span className={clsColor ? "pl-1.5" : ""}>{p.san ?? "…"}</span>
      {p.time_taken !== null && p.time_taken !== undefined && (
        <span className="ml-1 text-[11px] text-muted">{formatClock(p.time_taken)}</span>
      )}
    </button>
  );
}

export default function MoveList({ plies, selectedPly, onSelect }: Props) {
  const rows: { number: number; w?: PlyOut; b?: PlyOut }[] = [];
  for (const p of plies) {
    const moveNum = p.ply === 0 ? 0 : Math.floor(p.ply / 2);
    if (p.ply % 2 === 0) rows.push({ number: moveNum + 1, w: p });
    else {
      if (rows.length === 0) rows.push({ number: 1, w: undefined });
      rows[rows.length - 1].b = p;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => onSelect(-1)}
        className={`inline-flex w-max items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors ${
          selectedPly === -1
            ? "bg-accent/15 text-accent ring-1 ring-accent/40"
            : "text-muted hover:bg-surface-3 hover:text-ink"
        }`}
      >
        Début
      </button>
      <div className="flex flex-col gap-0.5">
        {rows.map((r) => (
          <div key={r.number} className="flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted">
              {r.number}.
            </span>
            {r.w && (
              <PlyItem p={r.w} selected={selectedPly === r.w.ply} onSelect={() => onSelect(r.w!.ply)} />
            )}
            {r.b && (
              <PlyItem p={r.b} selected={selectedPly === r.b.ply} onSelect={() => onSelect(r.b!.ply)} />
            )}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3">
        {Object.entries(CLASS_COLOR)
          .filter(([k]) => k !== "book")
          .map(([k, c]) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-muted">
              <i
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: c }}
                aria-hidden
              />
              {CLASS_LABEL[k] ?? k}
            </span>
          ))}
      </div>
    </div>
  );
}