import type { CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import { Chess, type Square } from "chess.js";

export type Promo = "q" | "r" | "n" | "b";

export interface LegalTarget {
  to: Square;
  capture: boolean;
}

/** Toutes les cases légales atteignables depuis `square` sur la position FEN. */
export function legalMoveTargets(fen: string, square: Square): LegalTarget[] {
  try {
    const b = new Chess(fen);
    return b
      .moves({ square, verbose: true })
      .map((m) => ({ to: m.to, capture: !!m.captured || m.flags.includes("e") }));
  } catch {
    return [];
  }
}

/** Styles "pointillés" façon Lichess pour les coups possibles + sélection. */
export function legalSquareStyles(
  targets: LegalTarget[],
  selected?: Square | null,
): CustomSquareStyles {
  const styles: CustomSquareStyles = {};
  if (selected) {
    styles[selected] = { boxShadow: "inset 0 0 0 4px rgba(47,124,214,0.6)" };
  }
  for (const t of targets) {
    styles[t.to] = t.capture
      ? { boxShadow: "inset 0 0 0 6px rgba(0,0,0,0.16)" }
      : { background: "radial-gradient(circle, rgba(0,0,0,0.34) 24%, transparent 25%)" };
  }
  return styles;
}

export function pieceAt(fen: string, square: Square) {
  try {
    return new Chess(fen).get(square);
  } catch {
    return undefined;
  }
}

/** Couleur du camp au trait dans une position FEN ("w" | "b"). */
export function sideToMove(fen: string): "w" | "b" {
  return (fen.split(" ")[1] === "b" ? "b" : "w");
}

/** Essaie de jouer from→to sur une copie de `fen`. Retourne l'UCI, la FEN et le SAN. */
export function tryPlay(
  fen: string,
  from: Square,
  to: Square,
  promo?: Promo,
): { uci: string; fen: string; san: string } | null {
  try {
    const b = new Chess(fen);
    const mv = b.move({ from, to, promotion: promo });
    if (!mv) return null;
    return { uci: mv.from + mv.to + (mv.promotion ?? ""), fen: b.fen(), san: mv.san };
  } catch {
    return null;
  }
}
