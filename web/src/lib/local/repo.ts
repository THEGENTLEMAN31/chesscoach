import type { GameDetail, PlyOut } from "../types";
import { getDb, saveLocal } from "./store";

export interface LocalGameMeta {
  id: string;
  chesscom_id: number | null;
  username: string;
  white: string;
  black: string;
  white_elo: number | null;
  black_elo: number | null;
  result: string;
  player_color: string;
  time_class: string;
  time_control: string | null;
  end_time: number | null;
  eco: string | null;
  opening_name: string | null;
  termination: string | null;
  status: string;
  accuracy: number | null;
  acpl: number | null;
  classifications: Record<string, number> | null;
  pgn?: string | null;
  fen_start?: string | null;
  rules?: string | null;
  createdAt?: string;
}

export interface LocalGameRow {
  id: string;
  chesscom_id: number | null;
  username: string;
  white: string;
  black: string;
  white_elo: number | null;
  black_elo: number | null;
  result: string;
  player_color: string;
  time_class: string;
  time_control: string | null;
  end_time: number | null;
  eco: string | null;
  opening_name: string | null;
  termination: string | null;
  status: string;
  server_id: number | null;
  accuracy: number | null;
  acpl: number | null;
  classifications: string | null;
  pgn?: string | null;
  fen_start?: string | null;
  rules?: string | null;
  created_at: string | null;
}

export interface LocalPlyRow {
  game_id: string;
  ply: number;
  move_number: number | null;
  color: string | null;
  san: string | null;
  uci: string | null;
  fen_before: string | null;
  fen_after: string | null;
  eval_before_cp: number | null;
  mate_before: number | null;
  eval_after_cp: number | null;
  mate_after: number | null;
  best_move_uci: string | null;
  best_move_san: string | null;
  pv_best: string | null;
  cp_loss: number | null;
  winprob_before: number | null;
  winprob_after: number | null;
  winprob_loss: number | null;
  classification: string | null;
  clk: number | null;
  time_taken: number | null;
  phase: string | null;
  is_book: number;
  is_player: number;
  concept: string | null;
}

function metaFromRow(r: LocalGameRow): LocalGameMeta {
  return {
    id: r.id,
    chesscom_id: r.chesscom_id,
    username: r.username,
    white: r.white,
    black: r.black,
    white_elo: r.white_elo,
    black_elo: r.black_elo,
    result: r.result,
    player_color: r.player_color,
    time_class: r.time_class,
    time_control: r.time_control,
    end_time: r.end_time,
    eco: r.eco,
    opening_name: r.opening_name,
    termination: r.termination,
    status: r.server_id ? "synced" : r.status,
    accuracy: r.accuracy,
    acpl: r.acpl,
    classifications: r.classifications ? JSON.parse(r.classifications) : null,
    pgn: r.pgn,
    fen_start: r.fen_start,
    rules: r.rules,
    createdAt: r.created_at ?? undefined,
  };
}

function rowFromMeta(m: LocalGameMeta): LocalGameRow {
  return {
    id: m.id,
    chesscom_id: m.chesscom_id,
    username: m.username,
    white: m.white,
    black: m.black,
    white_elo: m.white_elo,
    black_elo: m.black_elo,
    result: m.result,
    player_color: m.player_color,
    time_class: m.time_class,
    time_control: m.time_control,
    end_time: m.end_time,
    eco: m.eco,
    opening_name: m.opening_name,
    termination: m.termination,
    status: m.status,
    server_id: null,
    accuracy: m.accuracy,
    acpl: m.acpl,
    classifications: m.classifications ? JSON.stringify(m.classifications) : null,
    pgn: m.pgn,
    fen_start: m.fen_start,
    rules: m.rules,
    created_at: m.createdAt ?? null,
  };
}

export async function saveGameLocal(
  meta: LocalGameMeta,
  plies: Omit<LocalPlyRow, "game_id">[],
  pending = true,
): Promise<void> {
  const db = await getDb();
  const gm = rowFromMeta(meta);
  gm.status = "pending";
  db.run(
    `INSERT INTO games (id, chesscom_id, username, white, black, white_elo, black_elo, result,
       player_color, time_class, time_control, end_time, eco, opening_name, termination, status,
       accuracy, acpl, classifications, rules, fen_start, pgn, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, COALESCE(?, datetime('now')))
     ON CONFLICT(id) DO UPDATE SET username=excluded.username, white=excluded.white,
       black=excluded.black, white_elo=excluded.white_elo, black_elo=excluded.black_elo,
       result=excluded.result, player_color=excluded.player_color, time_class=excluded.time_class,
       time_control=excluded.time_control, end_time=excluded.end_time, eco=excluded.eco,
       opening_name=excluded.opening_name, termination=excluded.termination, status=excluded.status,
       accuracy=excluded.accuracy, acpl=excluded.acpl, classifications=excluded.classifications,
       rules=excluded.rules, fen_start=excluded.fen_start, pgn=excluded.pgn,
       updated_at=datetime('now')`,
    [
      gm.id,
      gm.chesscom_id,
      gm.username,
      gm.white,
      gm.black,
      gm.white_elo,
      gm.black_elo,
      gm.result,
      gm.player_color,
      gm.time_class,
      gm.time_control,
      gm.end_time,
      gm.eco,
      gm.opening_name,
      gm.termination,
      "pending",
      gm.accuracy,
      gm.acpl,
      gm.classifications,
      gm.rules ?? "chess",
      gm.fen_start ?? null,
      gm.pgn ?? null,
      gm.created_at,
    ],
  );
  db.run("DELETE FROM plies WHERE game_id=?", [gm.id]);
  const ins = db.prepare(
    `INSERT OR REPLACE INTO plies (game_id, ply, move_number, color, san, uci, fen_before, fen_after,
       eval_before_cp, mate_before, eval_after_cp, mate_after, best_move_uci, best_move_san, pv_best,
       cp_loss, winprob_before, winprob_after, winprob_loss, classification, clk, time_taken, phase,
       is_book, is_player, concept)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  try {
    for (const p of plies) {
      ins.run([
        gm.id, p.ply, p.move_number, p.color, p.san, p.uci, p.fen_before, p.fen_after,
        p.eval_before_cp, p.mate_before, p.eval_after_cp, p.mate_after, p.best_move_uci,
        p.best_move_san, p.pv_best, p.cp_loss, p.winprob_before, p.winprob_after, p.winprob_loss,
        p.classification, p.clk, p.time_taken, p.phase, p.is_book, p.is_player, p.concept,
      ]);
    }
  } finally {
    ins.free();
  }
  if (pending) {
    db.run("INSERT OR REPLACE INTO sync_queue (game_id) VALUES (?)", [gm.id]);
  }
  await saveLocal();
}

export async function listLocalGames(limit = 200): Promise<LocalGameMeta[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT * FROM games ORDER BY COALESCE(end_time, 0) DESC, created_at DESC LIMIT ?`,
    [limit],
  );
  if (!res.length) return [];
  const cols = res[0].columns;
  return (res[0].values as unknown[][]).map((v) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (o[c] = v[i]));
    return metaFromRow(o as unknown as LocalGameRow);
  });
}

export async function listQueuedGames(): Promise<LocalGameRow[]> {
  const db = await getDb();
  const res = db.exec(
    `SELECT g.* FROM games g JOIN sync_queue q ON q.game_id=g.id ORDER BY g.created_at LIMIT 200`,
  );
  if (!res.length) return [];
  const cols = res[0].columns;
  return (res[0].values as unknown[][]).map((v) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c: string, i: number) => (o[c] = v[i]));
    return o as unknown as LocalGameRow;
  });
}

function plyFromRow(r: LocalPlyRow): PlyOut {
  return {
    ply: r.ply,
    san: r.san,
    uci: r.uci,
    fen_before: r.fen_before ?? "",
    fen_after: r.fen_after,
    eval_before: r.eval_before_cp !== null || r.mate_before !== null ? { cp: r.eval_before_cp, mate: r.mate_before } : null,
    eval_after: r.eval_after_cp !== null || r.mate_after !== null ? { cp: r.eval_after_cp, mate: r.mate_after } : null,
    best_move: r.best_move_uci,
    best_move_san: r.best_move_san,
    cp_loss: r.cp_loss,
    winprob_loss: r.winprob_loss,
    classification: r.classification,
    clk: r.clk,
    time_taken: r.time_taken,
    is_player: r.is_player === 1,
    is_book: r.is_book === 1,
    phase: r.phase,
    concept: r.concept,
  };
}

/** Charge une partie locale et la met au format GameDetail (review réutilisable). */
export async function getLocalGameDetail(id: string): Promise<GameDetail | null> {
  const db = await getDb();
  const res = db.exec("SELECT * FROM games WHERE id=?", [id]);
  if (!res.length || !res[0].values.length) return null;
  const cols = res[0].columns;
  const o: Record<string, unknown> = {};
  cols.forEach((c: string, i: number) => (o[c] = res[0].values[0][i]));
  const meta = metaFromRow(o as unknown as LocalGameRow);
  const pres = db.exec(
    "SELECT * FROM plies WHERE game_id=? ORDER BY ply", [id],
  );
  const pcols = pres.length ? pres[0].columns : [];
  const plies = pres.length
    ? (pres[0].values as unknown[][]).map((v) => {
        const po: Record<string, unknown> = {};
        pcols.forEach((c: string, i: number) => (po[c] = v[i]));
        return plyFromRow(po as unknown as LocalPlyRow);
      })
    : [];
  return {
    id: 0,
    username: meta.username,
    white: meta.white,
    black: meta.black,
    white_elo: meta.white_elo,
    black_elo: meta.black_elo,
    result: meta.result,
    player_color: meta.player_color,
    time_class: meta.time_class,
    time_control: meta.time_control,
    end_time: meta.end_time,
    eco: meta.eco,
    opening_name: meta.opening_name,
    termination: meta.termination,
    status: meta.status,
    accuracy: meta.accuracy,
    acpl: meta.acpl,
    classifications: meta.classifications,
    plies,
  };
}

export async function markSynced(localId: string, serverId: number): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM sync_queue WHERE game_id=?", [localId]);
  db.run("UPDATE games SET status='synced', server_id=? WHERE id=?", [serverId, localId]);
  await saveLocal();
}

export async function bumpQueue(localId: string, lastError: string): Promise<void> {
  const db = await getDb();
  db.run(
    "UPDATE sync_queue SET tries=tries+1, last_error=? WHERE game_id=?",
    [lastError, localId],
  );
  await saveLocal();
}

export async function removeLocalGame(id: string): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM sync_queue WHERE game_id=?", [id]);
  db.run("DELETE FROM plies WHERE game_id=?", [id]);
  db.run("DELETE FROM games WHERE id=?", [id]);
  await saveLocal();
}