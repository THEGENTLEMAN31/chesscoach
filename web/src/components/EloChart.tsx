import { useEffect, useMemo, useRef, useState } from "react";
import { rollingAverage, type EloPoint } from "../lib/game/elo-series";

export interface EloChartSeries {
  id: string;
  label: string;
  color: string;
  points: EloPoint[];
  dashed?: boolean;
}

interface EloChartProps {
  series: EloChartSeries[];
  height?: number;
  variant?: "compact" | "analysis";
  /** Affiche la moyenne glissante comme ligne principale. */
  smooth?: boolean;
  smoothWindow?: number;
  target?: number | null;
  onSelectPoint?: (p: EloPoint) => void;
}

const PAD_ANALYSIS = { top: 18, right: 18, bottom: 34, left: 54 };
const PAD_COMPACT = { top: 12, right: 12, bottom: 20, left: 40 };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setW(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceStep(range: number, count: number): number {
  if (range <= 0) return 1;
  const raw = range / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function smoothed(points: EloPoint[], window: number): (number | null)[] {
  return rollingAverage(points, window);
}

export default function EloChart({
  series,
  height = 320,
  variant = "analysis",
  smooth = false,
  smoothWindow = 10,
  target = null,
  onSelectPoint,
}: EloChartProps) {
  const [wrapRef, width] = useWidth();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const compact = variant === "compact";

  const prepared = useMemo(
    () =>
      series.map((s) => {
        const avg = smooth ? smoothed(s.points, smoothWindow) : null;
        return { ...s, avg };
      }),
    [series, smooth, smoothWindow],
  );

  const maxLen = Math.max(1, ...series.map((s) => s.points.length));
  const hasData = series.some((s) => s.points.length > 0);

  const W = Math.max(220, width || 640);
  const H = width > 0 && width < 480 ? Math.min(height, 240) : height;
  const m = compact ? PAD_COMPACT : width > 0 && width < 480 ? { top: 12, right: 12, bottom: 28, left: 42 } : PAD_ANALYSIS;
  const IW = Math.max(10, W - m.left - m.right);
  const IH = Math.max(10, H - m.top - m.bottom);

  const domain = useMemo(() => {
    const vals: number[] = [];
    for (const s of prepared) {
      for (const p of s.points) vals.push(p.elo);
      if (s.avg) for (const v of s.avg) if (v != null) vals.push(v);
    }
    if (vals.length === 0) return { eLo: 0, eHi: 1, ticks: [] as number[] };
    const a = Math.min(...vals);
    const b = Math.max(...vals);
    const pad = Math.max(8, (b - a) * 0.12);
    const step = niceStep(Math.max(30, b - a + 2 * pad), compact ? 3 : 4);
    const eLo = Math.floor((a - pad) / step) * step;
    const eHi = Math.ceil((b + pad) / step) * step;
    const ticks: number[] = [];
    for (let v = eLo; v <= eHi + step * 0.001; v += step) ticks.push(Math.round(v));
    return { eLo, eHi, ticks };
  }, [prepared, target, compact]);

  const T = (i: number) => m.left + (maxLen <= 1 ? IW / 2 : (i / (maxLen - 1)) * IW);
  const Y = (e: number) => m.top + (1 - (e - domain.eLo) / Math.max(1, domain.eHi - domain.eLo)) * IH;

  const buildPath = (vals: (number | null)[]) => {
    let d = "";
    let started = false;
    for (let i = 0; i < maxLen; i++) {
      const v = i < vals.length ? vals[i] : null;
      if (v == null) continue;
      d += `${started ? " L" : "M"} ${T(i).toFixed(1)} ${Y(v).toFixed(1)}`;
      started = true;
    }
    return d;
  };
  const areaPath = (vals: (number | null)[]) => {
    const line = buildPath(vals);
    if (!line) return "";
    let lastIdx = 0;
    for (let i = 0; i < vals.length; i++) if (vals[i] != null) lastIdx = i;
    return `${line} L ${T(lastIdx).toFixed(1)} ${Y(domain.eLo).toFixed(1)} L ${T(0).toFixed(1)} ${Y(domain.eLo).toFixed(1)} Z`;
  };

  const hoverPoint = useMemo(() => {
    if (hoverIndex == null) return null;
    let best: EloPoint | null = null;
    let bestD = Infinity;
    for (const s of series) {
      for (const p of s.points) {
        const d = Math.abs(p.index - hoverIndex);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }, [hoverIndex, series]);

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const idx = Math.round(((x - m.left) / IW) * (maxLen - 1));
    setHoverIndex(Math.max(0, Math.min(maxLen - 1, idx)));
  };

  const showXt = !compact && maxLen > 1;
  const xTickIdx = showXt
    ? Array.from(
        new Set(
          [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((maxLen - 1) * f)),
        ),
      )
        .filter((i) => i >= 0 && i < maxLen)
        .sort((a, b) => a - b)
    : [];

  const hoverX = hoverPoint ? T(hoverPoint.index) : 0;

  if (width > 0 && !hasData) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-center">
        <p className="text-sm text-muted">Pas encore de parties.</p>
        <p className="text-xs text-subtle">Joue et synchronise pour voir ta progression.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {!compact && series.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={W}
          height={H}
          className="w-full touch-pan-y select-none"
          role="img"
          aria-label="Progression Elo par partie"
          onPointerMove={onMove}
          onPointerLeave={() => setHoverIndex(null)}
          onClick={() => {
            if (onSelectPoint && hoverPoint) onSelectPoint(hoverPoint);
          }}
        >
          {/* grille horizontale */}
          {domain.ticks.map((e) => (
            <g key={`y${e}`}>
              <line
                x1={m.left}
                x2={W - m.right}
                y1={Y(e)}
                y2={Y(e)}
                stroke="var(--chart-grid)"
                strokeDasharray="3 5"
                strokeWidth={1}
                opacity={compact ? 0.25 : 0.4}
              />
              {!compact && (
                <text x={m.left - 8} y={Y(e) + 4} fontSize={11} fill="var(--color-muted)" textAnchor="end" className="tabular-nums">
                  {e}
                </text>
              )}
            </g>
          ))}

          {/* objectif */}
          {target != null && target >= domain.eLo && target <= domain.eHi && (
            <g>
              <line
                x1={m.left}
                x2={W - m.right}
                y1={Y(target)}
                y2={Y(target)}
                stroke="var(--color-accent)"
                strokeDasharray="6 4"
                strokeWidth={1.5}
                opacity={0.8}
              />
              {!compact && (
                <text x={W - m.right} y={Y(target) - 4} fontSize={10} fill="var(--color-accent)" textAnchor="end">
                  objectif {target}
                </text>
              )}
            </g>
          )}
          {/* objectif hors échelle : on le matérialise sans écraser la courbe */}
          {target != null && target > domain.eHi && !compact && (
            <text x={W - m.right} y={m.top - 4} fontSize={10} fill="var(--color-accent)" textAnchor="end">
              objectif {target} ↑
            </text>
          )}
          {target != null && target < domain.eLo && !compact && (
            <text x={W - m.right} y={H - m.bottom - 4} fontSize={10} fill="var(--color-accent)" textAnchor="end">
              objectif {target} ↓
            </text>
          )}

          {/* x ticks */}
          {xTickIdx.map((i) => (
            <text key={`x${i}`} x={T(i)} y={H - m.bottom + 18} fontSize={11} fill="var(--color-muted)" textAnchor="middle" className="tabular-nums">
              {i + 1}
            </text>
          ))}

          {/* séries */}
          {prepared.map((s) => {
            const rawVals = s.points.map((p) => p.elo);
            const mainVals = s.avg ?? rawVals;
            const mainColor = s.color;
            return (
              <g key={s.id}>
                {/* aire sous la ligne : uniquement en vue analyse mono-série */}
                {!compact && series.length === 1 && (
                  <path d={areaPath(mainVals)} fill={mainColor} fillOpacity={0.1} stroke="none" />
                )}
                {/* ligne brute (si lissé) */}
                {s.avg && (
                  <path d={buildPath(rawVals)} fill="none" stroke={mainColor} strokeWidth={1.2} opacity={0.5} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {/* ligne principale */}
                <path
                  d={buildPath(mainVals)}
                  fill="none"
                  stroke={mainColor}
                  strokeWidth={s.avg ? 2.6 : 2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={s.dashed ? "6 5" : undefined}
                />
                {/* points bruts si peu denses */}
                {s.points.length <= 40 &&
                  s.points.map((p) => (
                    <circle key={`${s.id}-${p.gameId}`} cx={T(p.index)} cy={Y(p.elo)} r={compact ? 2 : 2.4} fill={mainColor} opacity={s.avg ? 0.35 : 0.9} />
                  ))}
                {/* dernier point annoté */}
                {s.points.length > 0 &&
                  (() => {
                    const last = s.points[s.points.length - 1];
                    const lastVal = mainVals[mainVals.length - 1] ?? last.elo;
                    return (
                      <g>
                        <circle cx={T(last.index)} cy={Y(lastVal)} r={3.6} fill={mainColor} stroke="var(--color-surface-2)" strokeWidth={1.5} />
                        <text x={T(last.index)} y={Y(lastVal) - 8} fontSize={11} fontWeight={700} fill={mainColor} textAnchor="end">
                          {Math.round(lastVal)}
                        </text>
                      </g>
                    );
                  })()}
              </g>
            );
          })}

          {/* crosshair */}
          {hoverPoint && (
            <line x1={hoverX} x2={hoverX} y1={m.top} y2={H - m.bottom} stroke="var(--chart-crosshair)" strokeWidth={1} opacity={0.6} />
          )}
        </svg>

        {/* tooltip */}
        {hoverPoint && (
          <div
            className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
            style={{
              left: hoverX,
              transform: `translateX(${hoverX > W * 0.62 ? "-100%" : "8px"})`,
              top: m.top,
            }}
          >
            <p className="mb-1 font-medium text-ink">
              Partie {hoverPoint.gameNumber} · {fmtDate(hoverPoint.date)}
            </p>
            <ul className="flex flex-col gap-1">
              {series.map((s) => {
                const p = s.points.find((pt) => pt.index === hoverPoint.index) ??
                  s.points.reduce<EloPoint | null>((acc, pt) => {
                    if (!acc) return pt;
                    return Math.abs(pt.index - hoverPoint.index) < Math.abs(acc.index - hoverPoint.index) ? pt : acc;
                  }, null);
                if (!p) return null;
                return (
                  <li key={s.id} className="flex flex-col gap-0.5">
                    <span className="inline-flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      <b className="tabular-nums text-ink">{p.elo}</b>
                    </span>
                    <span className="flex items-center justify-between gap-3 text-[11px] text-muted">
                      <span className="truncate">
                        {p.result === "W" ? "Victoire" : p.result === "D" ? "Nulle" : "Défaite"} vs {p.opponent}
                      </span>
                      {p.delta != null && (
                        <span className={p.delta >= 0 ? "text-eval-up tabular-nums" : "text-eval-down tabular-nums"}>
                          {p.delta >= 0 ? "+" : ""}
                          {p.delta}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
      {!compact && (
        <p className="text-[11px] text-subtle">Axe = ordre des parties. Survole pour le détail ; clique pour ouvrir la partie.</p>
      )}
    </div>
  );
}
