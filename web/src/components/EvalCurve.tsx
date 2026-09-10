import { ChartTooltip, Grid, Line, LineChart, type TooltipRow } from "./charts";
import type { GameDetail } from "../lib/types";
import { CLASS_COLOR, CLASS_LABEL } from "../lib/constants";
import { playerWinProb, plyToDate } from "../lib/game/eval";

interface Props {
  game: GameDetail;
}

interface Row {
  [key: string]: unknown;
  date: Date;
  ply: number;
  wp: number | null;
  classification: string | null;
  san: string | null;
  color: string;
  is_player: boolean;
}

const Y_TICKS = [0, 25, 50, 75, 100];

export default function EvalCurve({ game }: Props) {
  let prevWp: number | null = null;
  const data: Row[] = game.plies.map((p) => {
    const raw = playerWinProb(p.eval_after, game.player_color);
    const wp = raw ?? prevWp ?? 50;
    prevWp = wp;
    return {
      date: plyToDate(p.ply),
      ply: p.ply,
      wp,
      classification: p.classification,
      san: p.san,
      color: (p.classification && CLASS_COLOR[p.classification]) || "var(--muted)",
      is_player: p.is_player,
    };
  });

  if (data.length < 2) return null;

  const rowsFor = (d: Row): TooltipRow[] => {
    const rows: TooltipRow[] = [];
    rows.push({
      color: "var(--chart-1)",
      label: "Probabilité de gain",
      value: d.wp === null ? "—" : `${d.wp}%`,
    });
    if (d.san) {
      rows.push({
        color: d.color,
        label: `${d.is_player ? "Toi" : "Adversaire"} · ${d.san}`,
        value: "—",
      });
    }
    if (d.classification) {
      rows.push({
        color: d.color,
        label: CLASS_LABEL[d.classification] ?? d.classification,
        value: "—",
      });
    }
    return rows;
  };

  return (
    <div className="relative">
      {/* Y-axis labels */}
      <div
        className="absolute top-2 bottom-8 flex flex-col justify-between text-[10px] text-muted pointer-events-none select-none"
        style={{ left: 0, width: 36 }}
      >
        {Y_TICKS.map((v) => (
          <span key={v} className="tabular-nums text-right pr-1">{v}%</span>
        ))}
      </div>

      <LineChart
        data={data}
        xDataKey="date"
        status="ready"
        style={{ height: 260 }}
        margin={{ top: 8, right: 8, bottom: 28, left: 44 }}
        tickLabelFormatter={(d) => `C${String((d as Row).ply + 1)}`}
      >
        <Grid
          numTicksRows={4}
          rowTickValues={Y_TICKS}
          strokeDasharray="3 4"
          highlightRowValues={[50]}
          highlightRowStroke="var(--muted)"
          highlightRowStrokeDasharray="6 3"
        />
        <Line
          dataKey="wp"
          stroke="var(--chart-1)"
          strokeWidth={2}
          showMarkers
          markers={{ radius: 2.5, strokeWidth: 0, fill: "var(--chart-1)", fadeOnHover: false }}
        />
        <ChartTooltip rows={(d) => rowsFor(d as Row)} />
      </LineChart>
    </div>
  );
}