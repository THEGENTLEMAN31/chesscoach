import type { PlyOut } from "../types";
import { CLASS_COLOR } from "../constants";
import { formatClock } from "../api";

interface Props {
  plies: PlyOut[];
  selectedPly: number;
  onSelect: (ply: number) => void;
}

function PlyItem({ p, selected, onSelect }: { p: PlyOut; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`ply ${selected ? "ply-selected" : ""} ${p.classification ? `ply-${p.classification}` : ""}`}
      onClick={onSelect}
      title={`${p.san ?? ""} — ${p.classification ?? ""}`}
    >
      {p.san ?? "…"}
      {p.time_taken !== null && p.time_taken !== undefined && (
        <span className="ply-clock">{formatClock(p.time_taken)}</span>
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
    <div className="movelist">
      <button
        className={`ply ply-special ${selectedPly === -1 ? "ply-selected" : ""}`}
        onClick={() => onSelect(-1)}
      >
        Début
      </button>
      {rows.map((r) => (
        <div key={r.number} className="mrow">
          <span className="mnum">{r.number}.</span>
          {r.w && (
            <PlyItem p={r.w} selected={selectedPly === r.w.ply} onSelect={() => onSelect(r.w!.ply)} />
          )}
          {r.b && (
            <PlyItem p={r.b} selected={selectedPly === r.b.ply} onSelect={() => onSelect(r.b!.ply)} />
          )}
        </div>
      ))}
      <div className="legend">
        {Object.entries(CLASS_COLOR)
          .filter(([k]) => k !== "book")
          .map(([k, c]) => (
            <span key={k} className="legend-item">
              <i style={{ background: c }} />
              {k}
            </span>
          ))}
      </div>
    </div>
  );
}
