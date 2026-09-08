/**
 * Portage TypeScript du modèle d'évaluation backend (api/app/eval.py).
 * Déterministe et identique au serveur : win-probability logistique,
 * classification style Lichess, précision et ACPL.
 */
export interface EvalPoint {
  cp: number | null;
  mate: number | null;
}

export const BEST = "best";
export const GOOD = "good";
export const INACCURACY = "inaccuracy";
export const MISTAKE = "mistake";
export const BLUNDER = "blunder";

export const CLASSIFICATION_ORDER = [BLUNDER, MISTAKE, INACCURACY, GOOD, BEST];

export const MOVE_SCORE: Record<string, number> = {
  [BEST]: 1.0,
  [GOOD]: 0.7,
  [INACCURACY]: 0.4,
  [MISTAKE]: 0.1,
  [BLUNDER]: 0.0,
};

export function hasScore(evalPoint: EvalPoint): boolean {
  return evalPoint.mate !== null || evalPoint.cp !== null;
}

/** Probabilité de gain (0-100) du côté `side` depuis une évaluation UCI
 * (score côté camp au trait `stm`). */
export function winProb(evalPoint: EvalPoint, stm: string, side: string): number {
  if (evalPoint.mate !== null) {
    const stmWins = evalPoint.mate > 0;
    if (side === stm) return stmWins ? 100 : 0;
    return stmWins ? 0 : 100;
  }
  const cp = evalPoint.cp;
  if (cp === null) return 50;
  let cpW = stm === "w" ? cp : -cp;
  if (side === "b") cpW = -cpW;
  return Math.max(0, Math.min(100, 100 / (1 + Math.pow(10, -cpW / 400))));
}

export interface ClassifyResult {
  classification: string;
  wpBefore: number;
  wpAfter: number;
  loss: number;
}

export function classify(
  evalBefore: EvalPoint,
  evalAfter: EvalPoint,
  side: string,
  wpBefore: number | null = null,
  wpAfter: number | null = null,
): ClassifyResult {
  const before = wpBefore !== null ? wpBefore : winProb(evalBefore, side, side);
  const after =
    wpAfter !== null
      ? wpAfter
      : winProb(evalAfter, side === "b" ? "w" : "b", side);
  const loss = before - after;
  let cls: string;
  if (loss >= 20) cls = BLUNDER;
  else if (loss >= 10) cls = MISTAKE;
  else if (loss >= 5) cls = INACCURACY;
  else if (loss >= 2) cls = GOOD;
  else cls = BEST;
  return { classification: cls, wpBefore: before, wpAfter: after, loss };
}

export function accuracy(scores: number[]): number {
  if (!scores.length) return 0;
  return Math.round((100 * scores.reduce((a, b) => a + b, 0)) / scores.length * 10) / 10;
}

export function acplFromLosses(losses: number[]): number {
  if (!losses.length) return 0;
  const avg = losses.reduce((a, b) => a + Math.max(0, b), 0) / losses.length;
  return Math.round(avg * 10) / 10;
}

export const CONCEPT_LABEL_SHARED: Record<string, string> = {
  hanging_piece: "Pièce en prise",
  missed_capture: "Prise manquée",
  fork: "Fourchette",
  pin_moved: "Pièce clouée déplacée",
  pin_missed: "Clouage manqué",
  missed_mate: "Mat manqué",
  candidate: "Coup candidat manqué",
  allowed_mate: "Mat subi",
  back_rank: "Mat de la première rangée",
  roque_missed: "Roque manqué",
  pawn_structure: "Faiblesse de pions",
  promotion: "Promotion manquée",
  passed_pawn: "Pion passé négligé",
  development: "Développement insuffisant",
  threat_ignored: "Menace adverse négligée",
};