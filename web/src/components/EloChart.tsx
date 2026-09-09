interface EloSeries {
  label: string;
  color: string;
  dates: string[];
  elo: (number | null)[];
}

interface EloChartProps {
  series: EloSeries[];
  dateMin?: string | null;
  dateMax?: string | null;
  eloMin?: number | null;
  eloMax?: number | null;
  height?: number;
}

const W = 940;
const PAD = { top: 24, right: 24, bottom: 56, left: 56 };

function tsi(iso: string): number {
  const s = iso.length === 10 ? iso + "T00:00:00Z" : iso;
  const n = Date.parse(s);
  return Number.isNaN(n) ? 0 : n;
}

const MOIS = ["jan", "fév", "mar", "avr", "mai", "juin", "juil", "aoû", "sep", "oct", "nov", "déc"];
function labelX(t: number): string {
  const d = new Date(t);
  return `${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export default function EloChart({
  series,
  dateMin,
  dateMax,
  eloMin,
  eloMax,
  height = 340,
}: EloChartProps) {
  type Pt = { iso: string; e: number; s: number };
  const all: Pt[] = [];
  const bySeries: Pt[][] = [];
  for (let s = 0; s < series.length; s++) bySeries.push([]);
  let tMin = Number.POSITIVE_INFINITY;
  let tMax = Number.NEGATIVE_INFINITY;
  for (let s = 0; s < series.length; s++) {
    const { dates, elo } = series[s];
    for (let i = 0; i < dates.length; i++) {
      if (elo[i] == null) continue;
      const t = tsi(dates[i]);
      const p: Pt = { iso: dates[i], e: elo[i] as number, s };
      all.push(p);
      bySeries[s].push(p);
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
    }
  }
  if (all.length === 0) return <p className="text-sm text-muted">Pas encore assez de points.</p>;

  const fT0 = dateMin ? tsi(dateMin) : Number.NEGATIVE_INFINITY;
  const fT1 = dateMax ? tsi(dateMax) + 86399999 : Number.POSITIVE_INFINITY;
  const fE0 = eloMin != null ? eloMin : Number.NEGATIVE_INFINITY;
  const fE1 = eloMax != null ? eloMax : Number.POSITIVE_INFINITY;
  const inF = (p: Pt) =>
    tsi(p.iso) >= fT0 && tsi(p.iso) <= fT1 && p.e >= fE0 && p.e <= fE1;

  const vis = all.filter(inF);
  const tA = vis.reduce((a, p) => Math.min(a, tsi(p.iso)), Number.POSITIVE_INFINITY);
  const tB = vis.reduce((a, p) => Math.max(a, tsi(p.iso)), Number.NEGATIVE_INFINITY);
  const eA = vis.reduce((a, p) => Math.min(a, p.e), Number.POSITIVE_INFINITY);
  const eB = vis.reduce((a, p) => Math.max(a, p.e), Number.NEGATIVE_INFINITY);
  const tLo = Number.isFinite(fT0) ? fT0 : tA;
  const tHi = Number.isFinite(fT1) ? fT1 : tB;
  const eLo = Number.isFinite(fE0) ? fE0 : Math.max(0, Math.floor((eA - 50) / 50) * 50);
  const eHi = Number.isFinite(fE1) ? fE1 : Math.ceil((eB + 50) / 50) * 50;
  const tSpan = Math.max(1, tHi - tLo);
  const eSpan = Math.max(100, eHi - eLo);

  const IW = W - PAD.left - PAD.right;
  const IH = height - PAD.top - PAD.bottom;
  const X = (t: number) => PAD.left + ((t - tLo) / tSpan) * IW;
  const Y = (e: number) => PAD.top + (1 - (e - eLo) / eSpan) * IH;

  const yticks: number[] = [];
  for (let i = 0; i <= 5; i++) yticks.push(eLo + (eSpan * i) / 5);
  const xticks: number[] = [];
  for (let i = 0; i <= 5; i++) xticks.push(tLo + (tSpan * i) / 5);

  const pathFor = (s: number) => {
    const pts = bySeries[s].filter(inF).sort((a, b) => tsi(a.iso) - tsi(b.iso));
    if (pts.length === 0) return null;
    let d = `M ${X(tsi(pts[0].iso)).toFixed(1)} ${Y(pts[0].e).toFixed(1)}`;
    let prevT: number | null = null;
    let prevE: number | null = null;
    for (const p of pts) {
      const t = tsi(p.iso);
      const e = p.e;
      if (prevT != null && prevE != null && t - prevT > 86400000 * 2) {
        d += ` L ${X(t).toFixed(1)} ${Y(prevE).toFixed(1)}`;
      }
      d += ` L ${X(t).toFixed(1)} ${Y(e).toFixed(1)}`;
      prevT = t;
      prevE = e;
    }
    return d;
  };

  return (
    <div className="flex flex-col gap-2">
      {/* légende */}
      <div className="flex flex-wrap gap-3">
        {series.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-label="Courbe Elo">
        {/* grille + axes Y */}
        {yticks.map((e) => (
          <g key={`y${e}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={Y(e)} y2={Y(e)} stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth={1} />
            <text x={PAD.left - 8} y={Y(e) + 3} fontSize={10} fill="var(--chart-label)" textAnchor="end">
              {Math.round(e)}
            </text>
          </g>
        ))}
        {/* axe X + dates */}
        {xticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={X(t)} x2={X(t)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth={1} />
            <text x={X(t)} y={height - PAD.bottom + 16} fontSize={10} fill="var(--chart-label)" textAnchor="middle">
              {labelX(t)}
            </text>
          </g>
        ))}
        {/* lignes de titre d'axes */}
        <text x={10} y={PAD.top - 8} fontSize={11} fill="var(--chart-label)">Elo</text>
        {/* courbes */}
        {series.map((s, idx) => {
          const d = pathFor(idx);
          return d ? (
            <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ) : null;
        })}
      </svg>
      {vis.length === 0 ? (
        <p className="text-xs text-muted">Aucun point dans cette période / plage elo.</p>
      ) : null}
    </div>
  );
}