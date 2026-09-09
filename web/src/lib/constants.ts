export const CLASS_LABEL: Record<string, string> = {
  best: "Coup optimal",
  good: "Bon coup",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Gaffe",
  book: "Théorique",
};

export const CLASS_SHORT: Record<string, string> = {
  best: "Optimal",
  good: "Bon",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Gaffe",
  book: "Théorique",
};

export const CLASS_COLOR: Record<string, string> = {
  best: "#3fb562",
  good: "#7db23c",
  inaccuracy: "#d9a441",
  mistake: "#e07b39",
  blunder: "#d9534f",
  book: "#7a8494",
};

export const CONCEPT_LABEL: Record<string, string> = {
  candidate: "Meilleur plan manqué",
  hanging_piece: "Pièce en prise",
  missed_capture: "Capture manquée",
  fork: "Fourchette",
  pin_moved: "Pièce clouée déplacée",
  pin_missed: "Clouage manqué",
  missed_mate: "Mat manqué",
  bad_trade: "Mauvais échange",
  allowed_mate: "Mat subi",
  back_rank: "Mat de la première rangée",
  roque_missed: "Roque manqué",
  king_exposure: "Roi affaibli",
  pawn_structure: "Faiblesse de pions",
  promotion: "Promotion négligée",
  passed_pawn: "Pion passé négligé",
  development: "Développement insuffisant",
  underdeveloped: "Pièce passive négligée",
  threat_ignored: "Menace ignorée",
};

export const CONCEPT_LIST = Object.keys(CONCEPT_LABEL);

export const TIME_CLASS_LABEL: Record<string, string> = {
  rapid: "Rapide",
  blitz: "Blitz",
  bullet: "Bullet",
  daily: "Journalier",
  global: "Toutes cadences",
};

export function formatDate(epochSec: number | null | undefined): string {
  if (!epochSec) return "—";
  return new Date(epochSec * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatClock(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}` : `${s}s`;
}