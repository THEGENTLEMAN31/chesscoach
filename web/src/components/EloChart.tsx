import { useMemo, useRef, useState } from "react";

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
  /** Paliers affichés (lignes pointillées discrètes), ex. 1200, 1400… */
  milestones?: number[];
}

const W = 940;
const PAD = { top: 32, right: 32, bottom: 64, left: 72 };

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

function labelFull(t: number): string {
  const d = new Date(t);
  return `${d.toLocaleDateString("fr-FR")} · ${labelX(t)}`;
}

export default function EloChart({
  series,
  dateMin,
  dateMax,
  eloMin,
  eloMax,
  height = 340,
  milestones = [1200, 1400, 1600, 1800, 2000, 2200],
}: EloChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Plage [0,1] du crosshair horizontal (ou null si pas de survol).
  const [hover, setHover] = useState<number | null>(null);

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
  const padE = Math.max(15, Math.round((eB - eA) * 0.15));
  const tLo = Number.isFinite(fT0) ? fT0 : tA;
  const tHi = Number.isFinite(fT1) ? fT1 : tB;
  const eLo = Number.isFinite(fE0) ? fE0 : Math.max(0, Math.floor(eA - padE));
  const eHi = Number.isFinite(fE1) ? fE1 : Math.ceil(eB + padE);
  const tSpan = Math.max(1, tHi - tLo);
  const eSpan = Math.max(20, eHi - eLo);

  const IW = W - PAD.left - PAD.right;
  const IH = height - PAD.top - PAD.bottom;
  const T = (t: number) => PAD.left + ((t - tLo) / tSpan) * IW;
  const Y = (e: number) => PAD.top + (1 - (e - eLo) / eSpan) * IH;

  const yticks: number[] = [];
  for (let i = 0; i <= 5; i++) yticks.push(eLo + (eSpan * i) / 5);
  const xticks: number[] = [];
  for (let i = 0; i <= 5; i++) xticks.push(tLo + (tSpan * i) / 5);

  const pathFor = (s: number) => {
    const pts = bySeries[s].filter(inF).sort((a, b) => tsi(a.iso) - tsi(b.iso));
    if (pts.length === 0) return null;
    let d = `M ${T(tsi(pts[0].iso)).toFixed(1)} ${Y(pts[0].e).toFixed(1)}`;
    let prevT: number | null = null;
    let prevE: number | null = null;
    for (const p of pts) {
      const t = tsi(p.iso);
      const e = p.e;
      if (prevT != null && prevE != null && t - prevT > 86400000 * 2) {
        d += ` L ${T(t).toFixed(1)} ${Y(prevE).toFixed(1)}`;
      }
      d += ` L ${T(t).toFixed(1)} ${Y(e).toFixed(1)}`;
      prevT = t;
      prevE = e;
    }
    return d;
  };

  // ----- interactivité -----
  const hoverInfo = useMemo(() => {
    if (hover == null) return null;
    const xT = tLo + hover * tSpan;
    // Point de référence : le point visible le plus proche de l'abscisse survolée.
    let anchor: Pt | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const p of vis) {
      const d = Math.abs(tsi(p.iso) - xT);
      if (d < best) {
        best = d;
        anchor = p;
      }
    }
    if (!anchor) return null;
    const anchorT = tsi(anchor.iso);
    const rows = series.map((s, idx) => {
      const pts = bySeries[idx].filter(inF);
      let near: Pt | null = null;
      let b = Number.POSITIVE_INFINITY;
      for (const p of pts) {
        const d = Math.abs(tsi(p.iso) - anchorT);
        if (d < b) {
          b = d;
          near = p;
        }
      }
      return { label: s.label, color: s.color, elo: near ? near.e : null, iso: near?.iso ?? null };
    });
    return { anchorT, rows };
  }, [hover, vis, bySeries, series, inF, tLo, tSpan]);

  const xAnchor = hoverInfo ? T(hoverInfo.anchorT) : 0;

  const onMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const rel = (ev.clientX - r.left) / r.width; // 0..1 en largeur écran
    setHover(Math.min(1, Math.max(0, rel)));
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
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label="Courbe Elo des parties analysées (survol pour le détail)"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* grille + axes Y */}
          {yticks.map((e) => (
            <g key={`y${e}`}>
              <line x1={PAD.left} x2={W - PAD.right} y1={Y(e)} y2={Y(e)} stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth={1} />
              <text x={PAD.left - 10} y={Y(e) + 4} fontSize={12} fill="var(--ink)" textAnchor="end" fontWeight="500">
                {Math.round(e)}
              </text>
            </g>
          ))}
          {/* axe X + dates */}
          {xticks.map((t) => (
            <g key={`x${t}`}>
              <line x1={T(t)} x2={T(t)} y1={PAD.top} y2={height - PAD.bottom} stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth={1} />
              <text x={T(t)} y={height - PAD.bottom + 18} fontSize={11} fill="var(--ink)" textAnchor="middle" fontWeight="500">
                {labelX(t)}
              </text>
            </g>
          ))}
          {/* paliers */}
          {milestones.map((m) =>
            m >= eLo && m <= eHi ? (
              <g key={`m${m}`}>
                <line x1={PAD.left} x2={W - PAD.right} y1={Y(m)} y2={Y(m)} stroke="var(--chart-marker-border)" strokeDasharray="1 5" strokeWidth={1} opacity={0.5} />
                <text x={PAD.left - 8} y={Y(m) + 3} fontSize={9} fill="var(--chart-label)" opacity={0.7} textAnchor="end">
                  {m}
                </text>
              </g>
            ) : null,
          )}
          <text x={10} y={PAD.top - 8} fontSize={11} fill="var(--chart-label)">Elo</text>
          {/* courbes */}
          {series.map((s, idx) => {
            const d = pathFor(idx);
            return d ? (
              <path key={s.label} d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ) : null;
          })}
          {/* crosshair + points au survol */}
          {hoverInfo && (
            <g>
              <line
                x1={xAnchor}
                x2={xAnchor}
                y1={PAD.top}
                y2={height - PAD.bottom}
                stroke="var(--chart-crosshair)"
                strokeWidth={1}
              />
              {hoverInfo.rows.map((r) =>
                r.elo != null ? (
                  <circle key={r.label} cx={xAnchor} cy={Y(r.elo)} r={4} fill={r.color} stroke="var(--color-surface-2)" strokeWidth={1.5} />
                ) : null,
              )}
            </g>
          )}
        </svg>

        {/* tooltip flottant */}
        {hoverInfo && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-line bg-surface-2/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{
              left: `min(${(hover ?? 0) * 100}%, calc(100% - 1px))`,
              transform: `translateX(${(hover ?? 1) >= 0.72 ? "-100%" : "0"})`,
              top: 8,
            }}
          >
            <p className="mb-1 font-medium text-ink">{labelFull(hoverInfo.anchorT)}</p>
            <ul className="flex flex-col gap-1">
              {hoverInfo.rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-muted">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                    {r.label}
                  </span>
                  <b className="tabular-nums text-ink">{r.elo != null ? r.elo : "—"}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      {vis.length === 0 ? (
        <p className="text-xs text-muted">Aucun point dans cette période / plage elo.</p>
      ) : null}
    </div>
  );
}