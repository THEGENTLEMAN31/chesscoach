/** Import instantané local-first : PGN ou partie chess.com (PubAPI),
 * rejeu chess.js, analyse moteur local séquentielle, stockage SQLite local. */
import { Chess, type Move } from "chess.js";
import type { EngineWorker, GoOptions } from "../engine/engine";
import { acplFromLosses, accuracy, classify, MOVE_SCORE, winProb } from "../shared/eval";
import { analyzeError } from "../shared/concepts";
import type { LocalGameMeta, LocalPlyRow } from "./repo";
import { saveGameLocal } from "./repo";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export interface ParsedPly {
  ply: number;
  moveNumber: number;
  color: "w" | "b";
  san: string;
  uci: string;
  fenBefore: string;
  fenAfter: string;
  clk: number | null;
  timeTaken: number | null;
}

export interface ImportMeta {
  source: "pgn" | "pubapi";
  chesscomId: number | null;
  white: string;
  black: string;
  whiteElo: number | null;
  blackElo: number | null;
  result: string;
  playerColor: "w" | "b";
  timeClass: string;
  timeControl: string | null;
  endTime: number | null;
  eco: string | null;
  openingName: string | null;
  termination: string | null;
  fenStart: string;
  pgn: string;
  rules: string;
}

export class ImportError extends Error {}

function parseResult(marker: string): string {
  const m = marker.trim().toLowerCase().split(" ")[0];
  if (m.includes("1-0")) return "1-0";
  if (m.includes("0-1")) return "0-1";
  if (m.includes("1/2")) return "1/2-1/2";
  if (m === "draw" || m === "stalemate" || m === "insufficient") return "1/2-1/2";
  if (m === "white") return "1-0";
  if (m === "black") return "0-1";
  return "1/2-1/2";
}

/** Construire les plis via rejeu chess.js depuis des SANs (PGN). */
export function parsePgnMoves(fenStart: string, sans: string[]): ParsedPly[] {
  const b = new Chess(fenStart);
  const out: ParsedPly[] = [];
  for (const san of sans) {
    if (!san) continue;
    const fenBefore = b.fen();
    const mv = b.move(san);
    if (!mv) throw new ImportError(`coup illégal : ${san}`);
    out.push({
      ply: out.length,
      moveNumber: Math.floor(out.length / 2) + 1,
      color: mv.color,
      san: mv.san,
      uci: mv.from + mv.to + (mv.promotion ?? ""),
      fenBefore,
      fenAfter: b.fen(),
      clk: null,
      timeTaken: null,
    });
  }
  return out;
}

/** Construire les plis depuis les coups de l'API chess.com (objet {uci, san, white, black}). */
export interface CcMove {
  uci?: string;
  san?: string;
  white?: number;
  black?: number;
  move_number?: number;
}

export function parseChesscomMoves(fenStart: string, moves: CcMove[]): ParsedPly[] {
  const b = new Chess(fenStart);
  const out: ParsedPly[] = [];
  let lastClk: number | null = null;
  for (const cm of moves) {
    const uci = cm.uci ?? "";
    const fenBefore = b.fen();
    const mv: Move | null = b.move(uci);
    if (!mv) throw new ImportError(`coup illégal : ${uci}`);
    const clk = cm.white !== undefined ? cm.white / 1000 : cm.black !== undefined ? cm.black / 1000 : null;
    const timeTaken = lastClk !== null && clk !== null ? Math.max(0, lastClk - clk) : null;
    if (clk !== null) lastClk = clk;
    out.push({
      ply: out.length,
      moveNumber: cm.move_number ?? Math.floor(out.length / 2) + 1,
      color: mv.color,
      san: cm.san ?? mv.san,
      uci: mv.from + mv.to + (mv.promotion ?? ""),
      fenBefore,
      fenAfter: b.fen(),
      clk,
      timeTaken,
    });
  }
  return out;
}

export function parseGameHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const re = /\[([A-Za-z0-9_]+)\s+"((?:\\.|[^"])*)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(pgn))) {
    let v = m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (v.startsWith("?") || v === ".") v = "";
    headers[m[1]] = v;
  }
  return headers;
}

export function extractMoves(pgn: string): { sans: string[]; comments: string[] } {
  const body = pgn.replace(/\[[^\]]*\]/g, "").trim();
  const sans: string[] = [];
  const comments: string[] = [];
  const tokens = body.split(/\s+/);
  for (let t of tokens) {
    t = t.trim();
    if (!t) continue;
    if (t === "{" || t.startsWith("{")) {
      const open = t.indexOf("{");
      const close = t.lastIndexOf("}");
      if (open >= 0 && close > open) comments.push(t.slice(open + 1, close));
      continue;
    }
    if (t.startsWith("{")) {
      const close = t.indexOf("}");
      if (close >= 0) comments.push(t.slice(1, close));
      continue;
    }
    if (t.endsWith("}")) {
      if (t.length > 1) comments.push(t.slice(0, -1));
      continue;
    }
    if (/^\d+\.\.\./.test(t)) {
      t = t.replace(/^\d+\.\.\./, "");
      if (!t) continue;
    } else if (/^\d+\./.test(t)) {
      t = t.replace(/^\d+\./, "");
      if (!t || t.startsWith(".")) continue;
    }
    if (/^[a-hNRBQKO0]/.test(t)) {
      const san = t.replace(/[?!]+$/, "");
      sans.push(san);
    }
  }
  return { sans, comments };
}

export function buildMeta(input: {
  source: "pgn" | "pubapi";
  headers?: Record<string, string>;
  white?: string;
  black?: string;
  whiteElo?: number | null;
  blackElo?: number | null;
  result?: string;
  playerColor?: "w" | "b";
  timeClass?: string;
  timeControl?: string | null;
  endTime?: number | null;
  eco?: string | null;
  openingName?: string | null;
  fenStart?: string;
  pgn?: string;
  username: string;
  termination?: string | null;
}): ImportMeta {
  const h = input.headers ?? {};
  const result = input.result ?? parseResult(h.Result || "");
  const timeClass = input.timeClass ?? inferTimeClass(h.TimeControl);
  const pgn = input.pgn ?? "";
  return {
    source: input.source,
    chesscomId: input.headers?.["Site"]?.match(/(\d+)/)?.[0] ? Number(input.headers["Site"].match(/(\d+)/)![0]) : null,
    white: input.white ?? h.White ?? "?",
    black: input.black ?? h.Black ?? "?",
    whiteElo: input.whiteElo ?? (h.WhiteElo ? Number(h.WhiteElo) || null : null),
    blackElo: input.blackElo ?? (h.BlackElo ? Number(h.BlackElo) || null : null),
    result,
    playerColor: input.playerColor ?? (input.white?.toLowerCase() === input.username.toLowerCase() ? "w" : "b"),
    timeClass,
    timeControl: input.timeControl ?? h.TimeControl ?? null,
    endTime: input.endTime ?? null,
    eco: input.eco ?? h.ECO ?? null,
    openingName: input.openingName ?? h.Opening ?? null,
    termination: input.termination ?? h.Termination ?? null,
    fenStart: input.fenStart ?? h.FEN ?? START_FEN,
    pgn,
    rules: h.Variant && h.Variant !== "Standard" ? h.Variant : "chess",
  };
}

function inferTimeClass(tc: string | undefined): string {
  if (!tc) return "rapid";
  const parts = tc.split("+");
  const base = Number(parts[0]);
  if (!Number.isFinite(base)) return "rapid";
  if (base <= 30) return "bullet";
  if (base <= 180) return "blitz";
  if (base < 1800) return "rapid";
  return "daily";
}

export function metaToLocal(meta: ImportMeta): LocalGameMeta {
  return {
    id: meta.source === "pubapi" ? `cc:${meta.chesscomId}` : `pgn:${meta.pgn.length ? hashPgn(meta.pgn) : Date.now()}`,
    chesscom_id: meta.chesscomId,
    username: meta.playerColor === "w" ? meta.white : meta.black,
    white: meta.white,
    black: meta.black,
    white_elo: meta.whiteElo,
    black_elo: meta.blackElo,
    result: meta.result,
    player_color: meta.playerColor,
    time_class: meta.timeClass,
    time_control: meta.timeControl,
    end_time: meta.endTime,
    eco: meta.eco,
    opening_name: meta.openingName,
    termination: meta.termination,
    status: "pending",
    accuracy: null,
    acpl: null,
    classifications: null,
    pgn: meta.pgn,
    fen_start: meta.fenStart,
    rules: meta.rules,
  };
}

export function hashPgn(pgn: string): string {
  let h = 5381;
  for (let i = 0; i < pgn.length; i++) h = (((h << 5) + h) ^ pgn.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export function phaseOf(moveNumber: number): "opening" | "middlegame" | "endgame" {
  if (moveNumber < 10) return "opening";
  if (moveNumber < 40) return "middlegame";
  return "endgame";
}

export interface AnalysedPly extends ParsedPly {
  evalBeforeCp: number | null;
  mateBefore: number | null;
  evalAfterCp: number | null;
  mateAfter: number | null;
  bestUci: string | null;
  bestSan: string | null;
  cpLoss: number | null;
  winprobBefore: number | null;
  winprobAfter: number | null;
  winprobLoss: number | null;
  classification: string | null;
  concept: string | null;
}

export interface ImportProgress {
  done: number;
  total: number;
}

/** Analyse incrémentale locale : évalue chaque position une fois, classifie
 * les coups du joueur, détecte les concepts, calcule précision/ACPL. */
export async function analysePlies(
  plies: ParsedPly[],
  playerColor: "w" | "b",
  engine: EngineWorker,
  opts: GoOptions = { movetime: 400, depth: 12 },
  onProgress?: (p: ImportProgress) => void,
  cancelled?: () => boolean,
): Promise<{ analysed: AnalysedPly[]; accuracy: number | null; acpl: number | null; classifications: Record<string, number> }> {
  const evals: { cp: number; mate: number | null; best: string | null }[] = [];
  for (let i = 0; i < plies.length; i++) {
    if (cancelled?.()) throw new ImportError("analyse annulée");
    const r = await engine.evalFen(plies[i].fenBefore, opts);
    evals.push(r ? { cp: r.cp, mate: r.mate, best: r.best } : { cp: 0, mate: null, best: null });
    onProgress?.({ done: i + 1, total: plies.length });
  }

  const analysed: AnalysedPly[] = [];
  const scores: number[] = [];
  const losses: number[] = [];
  const classifications: Record<string, number> = {};

  for (let i = 0; i < plies.length; i++) {
    const p = plies[i];
    const eb = evals[i];
    const ea = evals[i + 1] ?? evals[i];
    const stmB = p.color;
    const stmA = stmB === "w" ? "b" : "w";

    const winProbB = winProb({ cp: eb.cp, mate: eb.mate }, stmB, p.color);
    const winProbA = winProb({ cp: ea.cp, mate: ea.mate }, stmA, p.color);

    let cls: string | null = null;
    let loss: number | null = null;
    let concept: string | null = null;
    let bestSan: string | null = null;

    if (p.color === playerColor) {
      // SAN du coup moteur (pour missed_capture/roque)
      if (eb.best) {
        try {
          const cb = new Chess(p.fenBefore);
          const m = cb.move(eb.best);
          if (m) bestSan = m.san;
        } catch {
          bestSan = null;
        }
      }
      const r = classify({ cp: eb.cp, mate: eb.mate }, { cp: ea.cp, mate: ea.mate }, p.color, winProbB, winProbA);
      cls = r.classification;
      loss = r.loss;
      classifications[cls] = (classifications[cls] ?? 0) + 1;
      scores.push(MOVE_SCORE[cls] ?? 0.5);
      if (loss !== null) losses.push(loss);
      if (eb.best && p.uci !== eb.best && (cls === "blunder" || cls === "mistake")) {
        const conceptRes = analyzeError({
          fenBefore: p.fenBefore,
          uci: p.uci,
          bestUci: eb.best,
          bestSan,
          mateBefore: eb.mate,
          mateAfter: ea.mate,
          phase: phaseOf(p.moveNumber),
          color: p.color,
          winprobBefore: winProbB,
        });
        concept = conceptRes.primary;
      }
    }

    const playerCp = (cp: number) => (p.color === "w" ? cp : -cp);
    analysed.push({
      ...p,
      evalBeforeCp: eb.cp,
      mateBefore: eb.mate,
      evalAfterCp: ea.cp,
      mateAfter: ea.mate,
      bestUci: eb.best ?? null,
      bestSan,
      cpLoss: p.color === playerColor ? playerCp(eb.cp) - playerCp(ea.cp) : null,
      winprobBefore: winProbB,
      winprobAfter: winProbA,
      winprobLoss: p.color === playerColor ? Math.max(0, winProbB - winProbA) : null,
      classification: cls,
      concept,
    });
  }

  const acc = accuracy(scores);
  const acpl = acplFromLosses(losses);
  return { analysed, accuracy: scores.length ? acc : null, acpl: scores.length ? acpl : null, classifications };
}

export function toPlyRows(analysed: AnalysedPly[], playerColor: "w" | "b"): Omit<LocalPlyRow, "game_id">[] {
  return analysed.map((p) => ({
    ply: p.ply,
    move_number: p.moveNumber,
    color: p.color,
    san: p.san,
    uci: p.uci,
    fen_before: p.fenBefore,
    fen_after: p.fenAfter,
    eval_before_cp: p.evalBeforeCp,
    mate_before: p.mateBefore,
    eval_after_cp: p.evalAfterCp,
    mate_after: p.mateAfter,
    best_move_uci: p.bestUci,
    best_move_san: p.bestSan,
    pv_best: null,
    cp_loss: p.cpLoss,
    winprob_before: p.winprobBefore,
    winprob_after: p.winprobAfter,
    winprob_loss: p.winprobLoss,
    classification: p.classification,
    clk: p.clk,
    time_taken: p.timeTaken,
    phase: phaseOf(p.moveNumber),
    is_book: 0,
    is_player: p.color === playerColor ? 1 : 0,
    concept: p.concept,
  }));
}

/** Convertit un objet Plis analysés en payload serveur (POST /api/sync/accept). */
export function toServerPayload(meta: ImportMeta, rows: Omit<LocalPlyRow, "game_id">[]) {
  return {
    white: meta.white,
    black: meta.black,
    white_elo: meta.whiteElo,
    black_elo: meta.blackElo,
    result: meta.result,
    player_color: meta.playerColor,
    time_class: meta.timeClass,
    time_control: meta.timeControl,
    end_time: meta.endTime,
    eco: meta.eco,
    opening_name: meta.openingName,
    termination: meta.termination,
    fen_start: meta.fenStart,
    pgn: meta.pgn || null,
    rules: meta.rules,
    chesscom_id: meta.chesscomId,
    plies: rows.map((r) => ({
      ply: r.ply,
      move_number: r.move_number,
      color: r.color,
      san: r.san,
      uci: r.uci,
      fen_before: r.fen_before,
      fen_after: r.fen_after,
      eval_before_cp: r.eval_before_cp,
      mate_before: r.mate_before,
      eval_after_cp: r.eval_after_cp,
      mate_after: r.mate_after,
      best_move_uci: r.best_move_uci,
      best_move_san: r.best_move_san,
      cp_loss: r.cp_loss,
      winprob_before: r.winprob_before,
      winprob_after: r.winprob_after,
      winprob_loss: r.winprob_loss,
      classification: r.classification,
      clk: r.clk,
      time_taken: r.time_taken,
      phase: r.phase,
      is_book: r.is_book,
      is_player: r.is_player,
      concept: r.concept,
    })),
  };
}

/** Résout un id de partie depuis une URL chess.com/game/live/{id}. */
export function gameIdFromUrl(url: string): number | null {
  const m = url.match(/chess\.com\/game\/(?:live|daily)\/(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Récupère une partie chess.com via PubAPI (search d'archives mensuelles borné). */
export async function fetchChesscomGame(
  gameId: number,
  username: string,
  maxMonths = 12,
): Promise<{ json: Record<string, any>; found: boolean }> {
  const archives = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`, {
    headers: { Accept: "application/json" },
  }).then((r) => (r.ok ? r.json() : Promise.reject(new ImportError(`PubAPI indisponible (${r.status})`) )));
  const months: string[] = archives.archives ?? [];
  for (let i = months.length - 1; i >= Math.max(0, months.length - maxMonths); i--) {
    const month = months[i];
    const data = await fetch(month).then((r) => (r.ok ? r.json() : null));
    if (!data) continue;
    const game = (data.games ?? []).find((g: { id?: number; url?: string }) => g.id === gameId);
    if (game) return { json: game, found: true };
  }
  return { json: {}, found: false };
}

export function buildMetaFromChesscom(json: any, username: string): ImportMeta {
  const white = json.white?.username ?? "?";
  const black = json.black?.username ?? "?";
  const whiteWon = json.white?.result === "win";
  const blackWon = json.black?.result === "win";
  const result = whiteWon ? "1-0" : blackWon ? "0-1" : "1/2-1/2";
  const playerColor = white.toLowerCase() === username.toLowerCase() ? "w" : black.toLowerCase() === username.toLowerCase() ? "b" : "w";
  return {
    source: "pubapi",
    chesscomId: json.id ?? null,
    white,
    black,
    whiteElo: json.white?.rating ?? null,
    blackElo: json.black?.rating ?? null,
    result,
    playerColor,
    timeClass: json.time_class ?? "rapid",
    timeControl: json.time_control ?? null,
    endTime: json.end_time ?? null,
    eco: json.openings?.[0]?.eco ?? null,
    openingName: json.openings?.[0]?.name ?? null,
    termination: json.termination ?? null,
    fenStart: json.initial_setup ?? START_FEN,
    pgn: json.pgn ?? "",
    rules: json.rules === "chess" ? "chess" : json.rules ?? "chess",
  };
}

export async function persistImportedGame(
  meta: ImportMeta,
  rows: Omit<LocalPlyRow, "game_id">[],
  accuracy: number | null,
  acpl: number | null,
  classifications: Record<string, number> | null,
  pending = true,
): Promise<string> {
  const local = metaToLocal(meta);
  local.accuracy = accuracy;
  local.acpl = acpl;
  local.classifications = classifications;
  await saveGameLocal(local, rows, pending);
  return local.id;
}