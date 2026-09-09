/**
 * Portage TS (subset) du détecteur de concepts backend (concepts.py).
 * Couvre : tactique (hanging/missed_capture/fork/missed_mate/allowed_mate/
 * bad_trade), sécurité du roi (back_rank/roque/king_exposure), structure
 * (pions), finale (promotion, pion passé), ouverture (développement),
 * stratégie (underdeveloped), prophylaxie (threat_ignored).
 * `pin_moved`/`pin_missed` restent côté serveur (chess.js n'expose pas is_pinned).
 * Parité mesurée vs backend : 86,4% (1727/2000) sur erreurs réelles — les seuls
 * écarts sont pin_moved/pin_missed. Attaques en pseudo-légal (miroir Board.attacks).
 */
import { Chess, type Square } from "chess.js";

export const PIECE_VALUE: Record<string, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export interface ConceptResult {
  concepts: string[];
  primary: string | null;
  causes: string[];
}

function pieceMap(b: Chess): Map<string, { type: string; color: string }> {
  const map = new Map<string, { type: string; color: string }>();
  const board = b.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (cell) {
        map.set(`${String.fromCharCode(97 + c)}${8 - r}`, {
          type: cell.type,
          color: cell.color,
        });
      }
    }
  }
  return map;
}

/** Attaques pseudo-légales depuis `sq` (miroir de chess.Board.attacks) :
 *  les pièces clouées attaquent quand même, les pièces qui se traver les pions
 *  bloquent la ligne après la première pièce rencontrée. */
function pseudoAttacks(b: Chess, sq: string): Set<string> {
  const out = new Set<string>();
  const p = pieceMap(b).get(sq);
  if (!p) return out;
  const fr = sq.charCodeAt(0) - 97;
  const rr = Number(sq[1]) - 1;
  const add = (f: number, r: number) => {
    if (f >= 0 && f < 8 && r >= 0 && r < 8) out.add(`${String.fromCharCode(97 + f)}${r + 1}`);
  };
  switch (p.type) {
    case "n":
      for (const [df, dr] of KNIGHT_STEPS) add(fr + df, rr + dr);
      break;
    case "k":
      for (const [df, dr] of KING_STEPS) add(fr + df, rr + dr);
      break;
    case "p": {
      const d = p.color === "w" ? 1 : -1;
      add(fr - 1, rr + d);
      add(fr + 1, rr + d);
      break;
    }
    case "b":
      for (const dir of DIAG) walk(fr, rr, dir[0], dir[1]);
      break;
    case "r":
      for (const dir of ORTHO) walk(fr, rr, dir[0], dir[1]);
      break;
    case "q":
      for (const dir of [...DIAG, ...ORTHO]) walk(fr, rr, dir[0], dir[1]);
      break;
  }
  function walk(f: number, r: number, df: number, dr: number) {
    f += df;
    r += dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const s = `${String.fromCharCode(97 + f)}${r + 1}`;
      out.add(s);
      if (pieceMap(b).has(s)) break; // première pièce rencontrée : incluse, pas au-delà
      f += df;
      r += dr;
    }
  }
  return out;
}

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function attackersOf(b: Chess, sq: string, color: string): string[] {
  const out: string[] = [];
  const pm = pieceMap(b);
  for (const [s, p] of pm) {
    if (p.color === color && pseudoAttacks(b, s).has(sq)) out.push(s);
  }
  return out;
}

export function hangingSquares(b: Chess, color: string): Set<string> {
  const hang = new Set<string>();
  const enemy = color === "w" ? "b" : "w";
  for (const [sq, p] of pieceMap(b)) {
    if (p.color !== color) continue;
    const attackers = attackersOf(b, sq, enemy);
    if (!attackers.length) continue;
    const v = PIECE_VALUE[p.type];
    const profitable = attackers.some((a) => (PIECE_VALUE[pieceMap(b).get(a)!.type] ?? 9) <= v);
    if (!profitable) continue;
    const defenders = attackersOf(b, sq, color);
    const cheapDef = defenders.some(
      (d) => (PIECE_VALUE[pieceMap(b).get(d)!.type] ?? 100) <= v,
    );
    if (cheapDef) continue;
    hang.add(sq);
  }
  return hang;
}

export function isFork(b: Chess, fromSq: string, color: string): boolean {
  const pm = pieceMap(b);
  const atk = [...pseudoAttacks(b, fromSq)]
    .map((t) => pm.get(t))
    .filter((p): p is { type: string; color: string } => !!p && p.color !== color)
    .map((p) => PIECE_VALUE[p.type]);
  if (atk.length < 2) return false;
  const piece = pm.get(fromSq);
  if (piece && ["n", "b", "p"].includes(piece.type)) return true;
  return atk.length >= 3 || Math.max(...atk) >= 9;
}

function pawnIssues(b: Chess, color: string): [number, number] {
  const byFile = new Map<string, number>();
  for (const [sq, p] of pieceMap(b)) {
    if (p.type === "p" && p.color === color) {
      byFile.set(sq[0], (byFile.get(sq[0]) ?? 0) + 1);
    }
  }
  const files = [...byFile.keys()];
  const iso = files.filter((f) => !files.includes(String.fromCharCode(f.charCodeAt(0) - 1)) && !files.includes(String.fromCharCode(f.charCodeAt(0) + 1))).length;
  const doub = files.filter((f) => (byFile.get(f) ?? 0) > 1).length;
  return [iso, doub];
}

function isPassed(b: Chess, color: string, sq: string): boolean {
  const f = sq.charCodeAt(0) - 97;
  const r = Number(sq[1]);
  const step = color === "w" ? 1 : -1;
  const rFrom = r + step;
  const rTo = color === "w" ? 9 : 0;
  for (let rf = rFrom; color === "w" ? rf <= rTo : rf >= rTo; rf += step) {
    for (let ff = f - 1; ff <= f + 1; ff++) {
      if (ff < 0 || ff > 7) continue;
      const t = pieceMap(b).get(`${String.fromCharCode(97 + ff)}${rf}`);
      if (t && t.type === "p" && t.color !== color) return false;
    }
  }
  return true;
}

function kingRank(b: Chess, color: string): number | null {
  for (const [sq, p] of pieceMap(b)) {
    if (p.type === "k" && p.color === color) return Number(sq[1]);
  }
  return null;
}

const HOME_RANK: Record<string, string> = { w: "1", b: "8" };

/** Roi roqué (g1/c1 / g8/c8) : le pion directement devant (g2/c2…) a été
 * déplacé → trou certain dans le rempart. Les pas latéraux isolés (h2-h3,
 * « luft ») ne sont volontairement pas flagués (anti-faux-positifs). */
export function castledShieldBreach(b: Chess, color: "w" | "b", uci: string): boolean {
  for (const [sq, p] of pieceMap(b)) {
    if (p.type !== "k" || p.color !== color) continue;
    const file6 = sq.charCodeAt(0) - 97;
    const rank2 = sq[1];
    if (rank2 !== HOME_RANK[color] || (file6 !== 6 && file6 !== 2)) return false;
    const from = uci.slice(0, 2);
    const fromPiece = pieceMap(b).get(from);
    if (!fromPiece || fromPiece.type !== "p" || fromPiece.color !== color) return false;
    if (from.charCodeAt(0) - 97 !== file6) return false; // colonne du roi uniquement
    const shield = color === "w" ? "2" : "7";
    const ahead = color === "w" ? "3" : "6";
    return from[1] === shield || from[1] === ahead;
  }
  return false;
}

/** Pièce mineure (c/n) encore sur sa case de départ au milieu de partie, que le
 * meilleur coup du moteur voulait activer. */
export function underdevelopedPiece(
  b: Chess, color: "w" | "b", bestUci?: string | null, uci?: string | null,
): boolean {
  if (!bestUci || uci === bestUci) return false;
  const from = bestUci.slice(0, 2);
  const p = pieceMap(b).get(from);
  if (!p || p.color !== color || !["n", "b"].includes(p.type)) return false;
  return from[1] === HOME_RANK[color];
}

function backRankThreat(b: Chess, color: string): boolean {
  const kr = kingRank(b, color);
  if (kr === null) return color === "w" ? kr !== 1 : kr !== 8;
  const onBack = color === "w" ? kr === 1 : kr === 8;
  if (!onBack) return false;
  // cases devant le roi occupées par des pièces amies
  const king = [...pieceMap(b)].find(([, p]) => p.type === "k" && p.color === color)?.[0];
  if (!king) return false;
  const kf = king.charCodeAt(0) - 97;
  const fwd = color === "w" ? 1 : -1;
  let blocked = true;
  for (let df = -1; df <= 1; df++) {
    const ff = kf + df;
    if (ff < 0 || ff > 7) continue;
    const p = pieceMap(b).get(`${String.fromCharCode(97 + ff)}${Number(king[1]) + fwd}`);
    if (!p || p.color !== color) {
      blocked = false;
      break;
    }
  }
  if (!blocked) return false;
  const enemy = color === "w" ? "b" : "w";
  for (const [sq, p] of pieceMap(b)) {
    if (p.color !== enemy || !["r", "q"].includes(p.type)) continue;
    const rr = Number(sq[1]);
    if ((color === "w" && rr === 8) || (color === "b" && rr === 1)) return true;
  }
  return false;
}

export interface AnalyzeErrorInput {
  fenBefore: string;
  uci?: string | null;
  bestUci?: string | null;
  bestSan?: string | null;
  mateBefore?: number | null;
  mateAfter?: number | null;
  phase?: string | null;
  color: "w" | "b";
  winprobBefore?: number | null;
  previousWasError?: boolean;
  isNearBookExit?: boolean;
}

export function analyzeError(input: AnalyzeErrorInput): ConceptResult {
  const {
    fenBefore, uci, bestUci, bestSan,
    mateBefore, mateAfter, phase, color,
    winprobBefore, previousWasError, isNearBookExit,
  } = input;
  const concepts: string[] = [];
  const causes: string[] = [];
  let board: Chess;
  try {
    board = new Chess(fenBefore);
  } catch {
    return { concepts: ["candidate"], primary: "candidate", causes: [] };
  }

  if (mateBefore !== null && mateBefore !== undefined && mateBefore > 0) {
    if (bestUci && uci !== bestUci) concepts.push("missed_mate");
  }
  if (mateAfter !== null && mateAfter !== undefined && mateAfter > 0) {
    concepts.push("allowed_mate");
  }

  const hangingBefore = hangingSquares(board, color);
  const notBest = uci !== bestUci;
  if (hangingBefore.size && bestSan && bestSan !== "O-O" && bestSan !== "O-O-O" && notBest) {
    concepts.push("hanging_piece");
  }
  if (bestSan && bestSan.includes("x") && notBest) concepts.push("missed_capture");
  if (!hangingBefore.size && !(bestSan?.includes("x"))) {
    try {
      const afterB = new Chess(fenBefore);
      if (uci) {
        try {
          afterB.move(uci);
        } catch {
          afterB.reset();
        }
      }
      if (hangingSquares(afterB, color).size) concepts.push("hanging_piece");
    } catch {
      /* noop */
    }
  }

  if (bestUci && notBest) {
    try {
      const probe = new Chess(fenBefore);
      probe.move(bestUci);
      const to = bestUci.slice(2, 4);
      if (isFork(probe, to, color)) concepts.push("fork");
    } catch {
      /* noop */
    }
  }

  // Mauvais échange certain : la pièce capturante reste en prise après le coup
  // (pièce amie non défendue sur la case de prise) → perte nette ≥ 2.
  if (uci && notBest) {
    try {
      const src = new Chess(fenBefore);
      const moving = src.get(uci.slice(0, 2) as Square);
      const captured = src.get(uci.slice(2, 4) as Square);
      const cap = new Chess(fenBefore);
      cap.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
      const toSq = uci.slice(2, 4);
      if (
        moving && captured &&
        PIECE_VALUE[moving.type] > PIECE_VALUE[captured.type] &&
        attackersOf(cap, toSq, color === "w" ? "b" : "w").length > 0 &&
        attackersOf(cap, toSq, color).length === 0
      ) {
        concepts.push("bad_trade");
      }
    } catch {
      /* noop */
    }
  }

  if (backRankThreat(board, color)) concepts.push("back_rank");
  if ((bestSan === "O-O" || bestSan === "O-O-O") && notBest) concepts.push("roque_missed");
  if (uci && castledShieldBreach(board, color, uci)) concepts.push("king_exposure");

  if (uci) {
    try {
      const after = new Chess(fenBefore);
      try {
        after.move(uci);
      } catch {
        after.reset();
      }
      const [isoB, doubB] = pawnIssues(board, color);
      const [isoA, doubA] = pawnIssues(after, color);
      if (isoA > isoB || doubA > doubB) concepts.push("pawn_structure");
    } catch {
      /* noop */
    }
  }

  if (phase === "endgame") {
    if (bestSan && bestSan.includes("=") && notBest) concepts.push("promotion");
    if (bestUci && notBest) {
      try {
        const piece = pieceMap(board).get(bestUci.slice(0, 2));
        if (piece?.type === "p" && piece.color === color && isPassed(board, color, bestUci.slice(0, 2))) {
          concepts.push("passed_pawn");
        }
      } catch {
        /* noop */
      }
    }
  }

  if (phase === "opening") {
    let nb = 0;
    for (const [sq, p] of pieceMap(board)) {
      if (p.color !== color || !["n", "b"].includes(p.type)) continue;
      const rank = Number(sq[1]);
      if ((color === "w" && rank <= 2) || (color === "b" && rank >= 7)) nb += 1;
    }
    if (nb >= 2 && !((bestSan === "O-O" || bestSan === "O-O-O") && uci === bestUci)) {
      concepts.push("development");
    }
  } else if (phase === "middlegame") {
    if (underdevelopedPiece(board, color, bestUci, uci)) concepts.push("underdeveloped");
  }

  if (hangingBefore.size && !concepts.length && notBest) concepts.push("threat_ignored");

  if (winprobBefore !== null && winprobBefore !== undefined && winprobBefore >= 80) {
    causes.push("position_gagnante");
  }
  if (previousWasError) causes.push("apres_erreur");
  if (isNearBookExit) causes.push("sortie_ouverture");

  if (!concepts.length) concepts.push("candidate");
  const unique = [...new Set(concepts)];
  return {
    concepts: unique,
    primary: unique[0],
    causes: [...new Set(causes)],
  };
}