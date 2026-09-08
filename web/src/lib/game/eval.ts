import type { EvalPoint } from "../types";

/** Probabilité de gain (0-100) du joueur après un coup, depuis l'éval moteur. */
export function playerWinProb(
  evalPoint: EvalPoint | null | undefined,
  playerColor: string,
): number | null {
  const cp = evalPoint?.cp ?? null;
  const mate = evalPoint?.mate ?? null;
  if (cp === null && mate === null) return null;
  if (mate !== null) {
    const whiteGood = mate > 0;
    return whiteGood ? (playerColor === "w" ? 100 : 0) : playerColor === "w" ? 0 : 100;
  }
  let value = 100 / (1 + Math.pow(10, (-(cp ?? 0)) / 400));
  if (playerColor === "b") value = 100 - value;
  return Math.round(value);
}

/** Encodage x-axis : le numéro de coup (ply) devient une date pilotable par le chart. */
export function plyToDate(ply: number): Date {
  return new Date((ply + 1) * 86400000 * 31);
}

export function dateToPly(d: Date): number {
  return Math.round(d.getTime() / (86400000 * 31)) - 1;
}