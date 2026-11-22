import type { GameOut } from "../types";

export type GameResult = "W" | "D" | "L";

export interface EloPoint {
  /** Position 0-based dans la fenêtre affichée. */
  index: number;
  /** Numéro de partie (1-based) dans la fenêtre. */
  gameNumber: number;
  elo: number;
  /** Epoch ms. */
  date: number;
  opponent: string;
  result: GameResult;
  color: "w" | "b";
  /** Variation d'Elo par rapport à la partie précédente de la même cadence. */
  delta: number | null;
  gameId: number;
  timeClass: string;
}

function resultFor(g: GameOut): GameResult {
  const p = g.player_color === "w" ? g.white : g.black;
  if (g.result === "1/2-1/2") return "D";
  const winner = g.result === "1-0" ? g.white : g.black;
  return winner === p ? "W" : "L";
}

/**
 * Construit une série Elo « par partie » pour une cadence donnée.
 * Les parties sont triées chronologiquement, puis on ne garde que les
 * `limit` dernières (limit <= 0 = tout). L'axe X final est l'ordre de jeu
 * (1, 2, 3...), ce qui évite les trous calendaires des périodes d'inactivité.
 */
export function buildEloPoints(games: GameOut[], limit = 0): EloPoint[] {
  const rows = games
    .filter((g) => g.end_time != null)
    .map((g) => {
      const elo = g.player_color === "w" ? g.white_elo : g.black_elo;
      return { g, elo };
    })
    .filter((r): r is { g: GameOut; elo: number } => r.elo != null)
    .sort((a, b) => (a.g.end_time ?? 0) - (b.g.end_time ?? 0));

  const windowed = limit > 0 ? rows.slice(-limit) : rows;

  return windowed.map((r, i) => {
    const prev = i > 0 ? windowed[i - 1].elo : null;
    const g = r.g;
    return {
      index: i,
      gameNumber: i + 1,
      elo: r.elo,
      date: (g.end_time ?? 0) * 1000,
      opponent: g.player_color === "w" ? g.black : g.white,
      result: resultFor(g),
      color: g.player_color === "w" ? "w" : "b",
      delta: prev == null ? null : Math.round(r.elo - prev),
      gameId: g.id,
      timeClass: g.time_class,
    };
  });
}

/** Moyenne glissante sur `window` points (calcul partiel au début). */
export function rollingAverage(points: EloPoint[], window: number): (number | null)[] {
  if (window <= 1) return points.map((p) => p.elo);
  return points.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = points.slice(start, i + 1);
    if (slice.length === 0) return null;
    return Math.round(slice.reduce((a, p) => a + p.elo, 0) / slice.length);
  });
}

/** Choisit la cadence à mettre en avant (celle de la partie la plus récente). */
export function pickPrimaryTimeClass(
  byClass: { timeClass: string; points: EloPoint[] }[],
): { timeClass: string; points: EloPoint[] } | null {
  let best: { timeClass: string; points: EloPoint[] } | null = null;
  let bestDate = -Infinity;
  for (const c of byClass) {
    if (c.points.length === 0) continue;
    const last = c.points[c.points.length - 1].date;
    if (last > bestDate) {
      bestDate = last;
      best = c;
    }
  }
  return best;
}
