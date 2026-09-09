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
    <div>
      <LineChart
        data={data}
        xDataKey="date"
        status="ready"
        style={{ height: 210 }}
        margin={{ top: 8, right: 8, bottom: 26, left: 8 }}
        tickLabelFormatter={(d) => `c${String((d as Row).ply + 1)}`}
      >
        <Grid
          numTicksRows={4}
          strokeDasharray="3 4"
          highlightRowValues={[50]}
          highlightRowStroke="var(--muted)"
        />
        <Line
          dataKey="wp"
          stroke="var(--chart-1)"
          strokeWidth={2}
        />
        <ChartTooltip rows={(d) => rowsFor(d as Row)} />
      </LineChart>
    </div>
  );
}