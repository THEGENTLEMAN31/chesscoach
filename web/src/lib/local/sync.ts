/** Resync automatique de la file locale vers le serveur (retour réseau). */
import { api } from "../api";
import type { LocalGameRow } from "./repo";
import {
  bumpQueue,
  getLocalGameDetail,
  listQueuedGames,
  markSynced,
} from "./repo";

export interface DrainResult {
  attempted: number;
  synced: number;
  failed: number;
}

let draining = false;

/** Rejoue les parties en attente vers le serveur, une par une. Idempotent. */
export async function drainSyncQueue(): Promise<DrainResult> {
  if (draining) return { attempted: 0, synced: 0, failed: 0 };
  draining = true;
  const result: DrainResult = { attempted: 0, synced: 0, failed: 0 };
  try {
    const queued = await listQueuedGames();
    for (const row of queued as LocalGameRow[]) {
      const game = await getLocalGameDetail(row.id);
      if (!game) continue;
      result.attempted += 1;
      const payload = {
        white: game.white,
        black: game.black,
        white_elo: game.white_elo,
        black_elo: game.black_elo,
        result: game.result,
        player_color: game.player_color,
        time_class: game.time_class,
        time_control: game.time_control,
        end_time: game.end_time,
        eco: game.eco,
        opening_name: game.opening_name,
        termination: game.termination,
        fen_start: row.fen_start ?? undefined,
        pgn: row.pgn ?? undefined,
        chesscom_id: row.chesscom_id,
        rules: "chess",
        plies: game.plies.map((p) => ({
          ply: p.ply + 1,
          move_number: Math.ceil((p.ply + 1) / 2),
          color: (p.ply + 1) % 2 === 1 ? "w" : "b",
          san: p.san,
          uci: p.uci,
          fen_before: p.fen_before,
          fen_after: p.fen_after,
          eval_before_cp: p.eval_before?.cp ?? null,
          mate_before: p.eval_before?.mate ?? null,
          eval_after_cp: p.eval_after?.cp ?? null,
          mate_after: p.eval_after?.mate ?? null,
          best_move_uci: p.best_move,
          best_move_san: p.best_move_san,
          cp_loss: p.cp_loss,
          winprob_loss: p.winprob_loss,
          classification: p.classification,
          clk: p.clk,
          time_taken: p.time_taken,
          phase: p.phase,
          is_book: p.is_book ? 1 : 0,
          is_player: p.is_player ? 1 : 0,
          concept: p.concept,
        })),
      };
      try {
        const res = await api.acceptImport(payload);
        await markSynced(row.id, res.id);
        result.synced += 1;
      } catch (err) {
        result.failed += 1;
        await bumpQueue(row.id, String(err)).catch(() => {});
      }
    }
  } finally {
    draining = false;
  }
  return result;
}

/** Branche le drain automatique : au retour réseau (`online`) et au montage si connecté. */
export function autoSync(onDone: (r: DrainResult) => void): () => void {
  const run = () => void drainSyncQueue().then(onDone);
  window.addEventListener("online", run);
  if (typeof navigator !== "undefined" && navigator.onLine) run();
  return () => window.removeEventListener("online", run);
}