export interface EvalPoint {
  cp: number | null;
  mate: number | null;
}

export interface PlyOut {
  ply: number;
  san: string | null;
  uci: string | null;
  fen_before: string;
  fen_after: string | null;
  eval_before: EvalPoint | null;
  eval_after: EvalPoint | null;
  best_move: string | null;
  best_move_san: string | null;
  cp_loss: number | null;
  winprob_loss: number | null;
  classification: string | null;
  clk: number | null;
  time_taken: number | null;
  is_player: boolean;
  is_book: boolean;
  phase: string | null;
}

export interface GameOut {
  id: number;
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
}

export interface GameDetail extends GameOut {
  plies: PlyOut[];
}

export interface ClassCount {
  time_class: string;
  games: number;
  accuracy: number;
  acpl: number;
  wins: number;
  draws: number;
  losses: number;
}

export interface Stats {
  by_time_class: ClassCount[];
  move_classifications: Record<string, number>;
  openings: { eco: string; opening_name: string; n: number }[];
  totals: { blunder_acpl: number | null; avg_cp_loss: number | null };
}

export interface SyncStatus {
  running: boolean;
  run_id: number | null;
  pending_analysis: number;
  last: {
    id: number;
    username: string;
    started_at: string;
    finished_at: string | null;
    games_seen: number;
    games_new: number;
    games_analyzed: number;
    status: string;
    error: string | null;
  } | null;
}
