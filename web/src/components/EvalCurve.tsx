import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { GameDetail, PlyOut } from "../types";
import { CLASS_COLOR } from "../constants";

/** Probabilité de gain (0-100) du joueur après le coup, depuis l'éval moteur. */
function playerWinProb(p: PlyOut, playerColor: string): number | null {
  const cp = p.eval_after?.cp ?? null;
  const mate = p.eval_after?.mate ?? null;
  if (cp === null && mate === null) return null;
  if (mate !== null) {
    const whiteGood = mate > 0;
    return whiteGood ? (playerColor === "w" ? 100 : 0) : playerColor === "w" ? 0 : 100;
  }
  let value = 100 / (1 + Math.pow(10, (-(cp ?? 0)) / 400));
  if (playerColor === "b") value = 100 - value;
  return Math.round(value);
}

interface Props {
  game: GameDetail;
  selectedPly: number;
  onSelect: (ply: number) => void;
}

export default function EvalCurve({ game, selectedPly, onSelect }: Props) {
  const data = game.plies.map((p) => {
    const wp = playerWinProb(p, game.player_color);
    return {
      ply: p.ply,
      wp: wp === null ? null : wp,
      classification: p.classification,
      san: p.san,
      color: (p.classification && CLASS_COLOR[p.classification]) || "#94a3b8",
      marker: p.is_player ? 12 : 4,
    };
  });

  return (
    <div className="eval-curve">
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: -20 }}
        >
        <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
        <XAxis
          dataKey="ply"
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickLine={false}
          label={{ value: "coup", position: "insideBottomRight", fill: "#6b7280", fontSize: 11 }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "#6b7280", fontSize: 11 }}
          tickLine={false}
          label={{ value: "probabilité de gain (%)", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, color: "#1c1c1c" }}
          labelStyle={{ color: "#1c1c1c" }}
          formatter={(value: number | string, _name, item) => {
            const p = data[Number(item.payload?.ply)];
            return [`${value}%`, p?.san ? `après ${p.san}` : "position"];
          }}
        />
        <ReferenceLine y={50} stroke="#9a9a9a" strokeDasharray="4 4" />
        {selectedPly >= 0 && (
          <ReferenceLine x={selectedPly} stroke="#38bdf8" strokeWidth={2} />
        )}
        <Line
          type="monotone"
          dataKey="wp"
          stroke="#38bdf8"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Scatter dataKey="wp">
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.color}
              cursor="pointer"
              onClick={() => onSelect(d.ply)}
              r={d.marker}
            />
          ))}
        </Scatter>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
