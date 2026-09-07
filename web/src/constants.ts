export const CLASS_LABEL: Record<string, string> = {
  best: "Coup parfait",
  good: "Bon coup",
  inaccuracy: "Imprécision",
  mistake: "Erreur",
  blunder: "Bévue",
  book: "Théorie",
};

export const CLASS_COLOR: Record<string, string> = {
  best: "#22c55e",
  good: "#a3e635",
  inaccuracy: "#eab308",
  mistake: "#f97316",
  blunder: "#ef4444",
  book: "#64748b",
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
