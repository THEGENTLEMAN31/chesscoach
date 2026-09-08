export const CLASS_LABEL: Record<string, string> = {
  best: "Coup parfait",
  good: "Bon coup",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Bévue",
  book: "Théorie",
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
  candidate: "Coup candidat manqué",
  hanging_piece: "Pièce en prise",
  missed_capture: "Capture manquée",
  fork: "Fourchette",
  pin_moved: "Pièce clouée déplacée",
  pin_missed: "Clouage manqué",
  missed_mate: "Mat manqué",
  allowed_mate: "Mat subi",
  back_rank: "Mat de la première rangée",
  roque_missed: "Roque manqué",
  pawn_structure: "Faiblesse de pions",
  promotion: "Promotion négligée",
  passed_pawn: "Pion passé négligé",
  development: "Développement insuffisant",
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