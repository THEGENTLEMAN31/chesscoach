export interface AuthUser {
  id: number;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  is_verified: boolean;
  chesscom_username: string;
}

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
  concept: string | null;
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

export interface GamesPage {
  total: number;
  items: GameOut[];
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
  last:
    | {
        id: number;
        username: string;
        started_at: string;
        finished_at: string | null;
        games_seen: number;
        games_new: number;
        games_analyzed: number;
        status: string;
        error: string | null;
      }
    | null;
}

export interface DigestResp {
  period: string;
  facts: string | null;
  narrative: string | string[] | null;
  created_at: string | null;
}

export interface Exercise {
  game_id: number;
  ply: number;
  san: string;
  fen_before: string;
  best_move_uci: string;
  best_move_san: string;
  winprob_loss: number | null;
  cp_loss: number | null;
  phase: string | null;
  move_number: number;
  concept: string | null;
  color: string | null;
  white: string;
  black: string;
  result: string;
  player_color: string;
  end_time: number | null;
  opening_name: string | null;
  eco: string | null;
  line?: {
    san: string | null;
    fen_before: string | null;
    best_move_uci: string | null;
    best_move_san: string | null;
  }[];
}

export interface MoveOut {
  game_id: number;
  ply: number;
  move_number: number | null;
  san: string | null;
  classification: string | null;
  winprob_loss: number | null;
  cp_loss: number | null;
  phase: string | null;
  time_taken: number | null;
  concept: string | null;
  fen_before: string | null;
  best_move_san: string | null;
  end_time: number | null;
  time_class: string | null;
  result: string | null;
  player_color: string | null;
  opening_name: string | null;
  eco: string | null;
  white: string | null;
  black: string | null;
}

export interface EtudeStats {
  n: number;
  correct: number;
  correct_rate: number;
  first_at: string | null;
  last_at: string | null;
  by_concept: { concept: string | null; n: number; correct: number; correct_rate: number }[];
  last_7d: number;
}

export interface EtudePayload {
  username: string;
  time_class: string;
  game_id?: number | null;
  ply?: number | null;
  fen: string;
  san?: string | null;
  best_move_uci: string;
  best_move_san?: string | null;
  concept?: string | null;
  attempt?: string | null;
  correct: boolean;
}