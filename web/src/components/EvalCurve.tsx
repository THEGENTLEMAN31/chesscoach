import { useMemo, useRef, useState } from "react";
import type { GameDetail } from "../lib/types";
import { playerWinProb } from "../lib/game/eval";
import { CLASS_LABEL, CLASS_COLOR } from "../lib/constants";

interface Props {
  game: GameDetail;
  selectedPly?: number | null;
  onSelectPly?: (ply: number) => void;
  height?: number;
}

const Y_TICKS = [0, 25, 50, 75, 100];

export default function EvalCurve({
  game,
  selectedPly = null,
  onSelectPly,
  height = 180,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data = useMemo(() => {
    let prevWp: number | null = null;
    return game.plies.map((p) => {
      const raw = playerWinProb(p.eval_after, game.player_color);
      const wp = raw ?? prevWp ?? 50;
      prevWp = wp;
      return {
        ply: p.ply,
        wp,
        cp: p.eval_after?.cp ?? null,
        mate: p.eval_after?.mate ?? null,
        san: p.san,
        classification: p.classification,
        bestMoveSan: p.best_move_san,
        isPlayer: p.is_player,
        color: (p.classification && CLASS_COLOR[p.classification]) ?? "var(--color-muted)",
        timeTaken: p.time_taken,
      };
    });
  }, [game]);

  if (data.length < 2) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line text-center">
        <p className="text-sm text-muted">Pas assez de données pour la courbe.</p>
        <p className="text-xs text-subtle">La partie doit avoir au moins 2 demi-coups analysés.</p>
      </div>
    );
  }

  const W = 1000;
  const H = height;
  const m = { top: 12, right: 12, bottom: 24, left: 40 };
  const IW = W - m.left - m.right;
  const IH = H - m.top - m.bottom;

  const T = (ply: number) => m.left + (ply / (data.length - 1)) * IW;
  const Y = (wp: number) => m.top + (1 - wp / 100) * IH;

  const paths = useMemo(() => {
    const white: string[] = [];
    const black: string[] = [];
    for (const d of data) {
      const x = T(d.ply);
      const y = Y(d.wp);
      if (d.wp >= 50) {
        white.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      }
      if (d.wp <= 50) {
        black.push(`${x.toFixed(1)} ${y.toFixed(1)}`);
      }
    }
    return { white, black };
  }, [data]);

  const hoverPt = hoverIdx != null ? data[hoverIdx] : null;
  const xAnchor = hoverPt ? T(hoverPt.ply) : 0;

  const rows = hoverPt
    ? [
        { label: "Probabilité de gain", value: `${hoverPt.wp}%`, color: "var(--color-accent)" },
        hoverPt.san && {
          label: `${hoverPt.isPlayer ? "Toi" : "Adversaire"} · ${hoverPt.san}`,
          value: "—",
          color: hoverPt.color,
        },
        hoverPt.classification && {
          label: CLASS_LABEL[hoverPt.classification] ?? hoverPt.classification,
          value: "—",
          color: hoverPt.color,
        },
        hoverPt.bestMoveSan && {
          label: `Meilleur coup: ${hoverPt.bestMoveSan}`,
          value: "—",
          color: "var(--color-success)",
        },
        hoverPt.timeTaken != null && {
          label: `Temps de réflexion`,
          value: `${Math.round(hoverPt.timeTaken)}s`,
          color: "var(--color-muted)",
        },
      ].filter(Boolean) as { label: string; value: string; color: string }[]
    : [];

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const el = ev.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    let best = Infinity;
    let idx = 0;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(T(data[i].ply) - x);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    setHoverX(x);
    if (best <= Math.max(24, 1000 / data.length)) setHoverIdx(idx);
    else setHoverIdx(null);
  };

  const handleClick = (ev: React.MouseEvent<SVGSVGElement>) => {
    if (!onSelectPly) return;
    const el = ev.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    let best = Infinity;
    let idx = 0;
    for (let i = 0; i < data.length; i++) {
      const d = Math.abs(T(data[i].ply) - x);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    if (best <= Math.max(24, 1000 / data.length)) {
      onSelectPly(data[idx].ply);
    }
  };

  const markerData = useMemo(() => {
    const markers: { ply: number; color: string; shape: "circle" | "diamond" | "square" | "ring"; label: string }[] = [];
    for (const d of data) {
      if (!d.classification) continue;
      const cls = d.classification;
      if (cls === "best" || cls === "book" || cls === "good") continue;
      let shape: "circle" | "diamond" | "square" | "ring" = "circle";
      if (cls === "blunder") shape = "square";
      else if (cls === "mistake") shape = "diamond";
      else if (cls === "inaccuracy") shape = "circle";
      markers.push({ ply: d.ply, color: CLASS_COLOR[cls] ?? "var(--color-muted)", shape, label: CLASS_LABEL[cls] ?? cls });
    }
    return markers;
  }, [data]);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="w-full touch-pan-y select-none"
        role="img"
        aria-label="Courbe d'évaluation de la partie"
        onPointerMove={onMove}
        onPointerLeave={() => { setHoverX(null); setHoverIdx(null); }}
        onClick={handleClick}
      >
        {/* Grille horizontale */}
        {Y_TICKS.map((v) => (
          <line
            key={`grid${v}`}
            x1={m.left}
            x2={W - m.right}
            y1={Y(v)}
            y2={Y(v)}
            stroke="var(--chart-grid)"
            strokeDasharray="3 4"
            strokeWidth={1}
          />
        ))}

        {/* Ligne 50% (base) */}
        <line
          x1={m.left}
          x2={W - m.right}
          y1={Y(50)}
          y2={Y(50)}
          stroke="var(--color-subtle)"
          strokeWidth={1.5}
        />

        {/* Aire Blancs (au-dessus de 50%) */}
        {paths.white.length > 0 && (
          <path
            fill="var(--eval-white)"
            fillOpacity={0.18}
            d={`M ${m.left} ${Y(50)} L ${paths.white.join(" ")} L ${T(data[data.length - 1].ply).toFixed(1)} ${Y(50)} Z`}
          />
        )}

        {/* Aire Noirs (en-dessous de 50%) */}
        {paths.black.length > 0 && (
          <path
            fill="var(--eval-black)"
            fillOpacity={0.45}
            d={`M ${m.left} ${Y(50)} L ${paths.black.join(" ")} L ${T(data[data.length - 1].ply).toFixed(1)} ${Y(50)} Z`}
          />
        )}

        {/* Ligne d'évaluation (ligne centrale) */}
        <path
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          d={`M ${T(data[0].ply).toFixed(1)} ${Y(data[0].wp).toFixed(1)} ${data
            .slice(1)
            .map((d) => `L ${T(d.ply).toFixed(1)} ${Y(d.wp).toFixed(1)}`)
            .join(" ")}`}
        />

        {/* Marqueurs par classification */}
        {markerData.map((m) => (
          <g key={`m${m.ply}`}>
            {m.shape === "circle" && (
              <circle cx={T(m.ply)} cy={Y(50)} r={4.5} fill={m.color} opacity={0.85} />
            )}
            {m.shape === "diamond" && (
              <polygon
                points={`${T(m.ply)},${Y(50) - 5.5} ${T(m.ply) + 5.5},${Y(50)} ${T(m.ply)},${Y(50) + 5.5} ${T(m.ply) - 5.5},${Y(50)}`}
                fill={m.color}
                opacity={0.85}
              />
            )}
            {m.shape === "square" && (
              <rect
                x={T(m.ply) - 5}
                y={Y(50) - 5}
                width={10}
                height={10}
                fill={m.color}
                opacity={0.85}
              />
            )}
            {m.shape === "ring" && (
              <circle cx={T(m.ply)} cy={Y(50)} r={5.5} fill="none" stroke={m.color} strokeWidth={2} opacity={0.85} />
            )}
          </g>
        ))}

        {/* Crosshair + point au survol */}
        {hoverPt && (
          <g>
            <line
              x1={xAnchor}
              x2={xAnchor}
              y1={m.top}
              y2={H - m.bottom}
              stroke="var(--chart-crosshair)"
              strokeWidth={1}
            />
            <circle cx={xAnchor} cy={Y(hoverPt.wp)} r={5} fill={hoverPt.color} stroke="var(--color-surface-2)" strokeWidth={2} />
          </g>
        )}

        {/* Sélection actuelle (coup joué) */}
        {selectedPly != null && (
          <line
            x1={T(selectedPly)}
            x2={T(selectedPly)}
            y1={m.top}
            y2={H - m.bottom}
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}

        {/* Ticks axe Y */}
        {Y_TICKS.map((v) => (
          <g key={`y${v}`}>
            <line x1={m.left - 6} x2={m.left} y1={Y(v)} y2={Y(v)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={m.left - 10} y={Y(v) + 4} fontSize={11} fill="var(--color-muted)" textAnchor="end" className="tabular-nums">
              {v === 0 ? "Noirs 100%" : v === 100 ? "Blancs 100%" : v === 50 ? "50 %" : `${v}%`}
            </text>
          </g>
        ))}

        {/* Ticks axe X (coups) */}
        {data.filter((_, i) => i % Math.max(1, Math.ceil(data.length / 10)) === 0).map((d) => (
          <g key={`x${d.ply}`}>
            <line x1={T(d.ply)} x2={T(d.ply)} y1={H - m.bottom} y2={H - m.bottom + 6} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={T(d.ply)} y={H - m.bottom + 18} fontSize={10} fill="var(--color-muted)" textAnchor="middle" className="tabular-nums">
              {d.san ? `C${d.ply + 1}` : `C${d.ply + 1}`}
            </text>
          </g>
        ))}

        {/* Légende markers en bas */}
        <g transform={`translate(${m.left}, ${H - 8})`}>
          {[
            { label: "Gaffe", shape: "square", color: CLASS_COLOR.blunder },
            { label: "Erreur", shape: "diamond", color: CLASS_COLOR.mistake },
            { label: "Imprécision", shape: "circle", color: CLASS_COLOR.inaccuracy },
            { label: "Optimal", shape: "ring", color: CLASS_COLOR.best },
          ].map((l, i) => (
            <g key={l.label} transform={`translate(${i * 110}, 0)`}>
              {l.shape === "circle" && <circle cx={8} cy={0} r={3.5} fill={l.color} />}
              {l.shape === "diamond" && <polygon points="8,-4 12,0 8,4 4,0" fill={l.color} />}
              {l.shape === "square" && <rect x={4} y={-4} width={8} height={8} fill={l.color} />}
              {l.shape === "ring" && <circle cx={8} cy={0} r={3.5} fill="none" stroke={l.color} strokeWidth={1.5} />}
              <text x={16} y={4} fontSize={9} fill="var(--color-muted)">{l.label}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* Tooltip flottant */}
      {hoverPt && hoverX != null && (
        <div
          className="pointer-events-none absolute z-10 min-w-40 rounded-lg border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
          style={{
            left: hoverX,
            transform: `translateX(${hoverX > W * 0.65 ? "-100%" : "8px"})`,
            top: 4,
          }}
        >
          <p className="mb-1 font-medium text-ink">{hoverPt.isPlayer ? "Toi" : "Adversaire"} · Coup {hoverPt.ply + 1}</p>
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.label} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </span>
                <b className="tabular-nums text-ink">{r.value}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}