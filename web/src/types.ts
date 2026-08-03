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

export interface ProfileItem {
  label: string;
  detail?: string;
  value?: string | number;
}

export interface ProfileWeakness {
  family: string;
  n: number;
  avg_loss: number;
  blunders: number;
  share: number;
}

export interface ProfileConcept {
  key: string;
  family: string;
  label: string;
  n: number;
  avg_loss: number;
  blunders: number;
}

export interface ProfileCause {
  label: string;
  n: number;
  share: number;
}

export interface ProfileTrend {
  key: string;
  label: string;
  n: number;
  overall_share: number;
  recent_share: number;
  delta: number;
}

export interface EtudeStats {
  n: number;
  correct: number;
  correct_rate: number;
  first_at: string | null;
  last_at: string | null;
  by_concept: { concept: string | null; n: number }[];
  last_7d: number;
}

export interface PlayerProfile {
  username: string;
  time_class?: string;
  computed_at: string;
  games: { n: number; by_time_class: Record<string, number>; first_game: string | null; last_game: string | null };
  rating: { min: number | null; max: number | null; latest: number | null };
  progress: {
    elo_curve: { date: string; elo: number }[];
    elo_trend: number | null;
    accuracy_trend: number | null;
  };
  objective: { target_elo: number | null; gap: number | null; months_estimated: number | null; progression_pct: number | null; targets?: Record<string, number> };
  strengths: ProfileItem[];
  weaknesses: ProfileWeakness[];
  concepts_missing: ProfileConcept[];
  root_causes: ProfileCause[];
  style: {
    avg_time_per_move: number;
    fast_move_pct: number;
    capture_pct: number;
    sacrifices: number;
    openings: { name: string; n: number; winrate: number }[];
  };
  mental: ProfileItem[];
  conversion: { won_positions: number; won_blown: number; conversion_rate: number; lost_positions: number; lost_saved: number };
  cognitive: string[];
  trends: { improving: ProfileTrend[]; worsening: ProfileTrend[]; recent_games_30d: number };
  recommendations: ProfileRecommendation[];
  etudes?: EtudeStats;
}

export interface ProfilesAll {
  username: string;
  profiles: Record<string, PlayerProfile>;
}

export interface ProfileRecommendation {
  priority: string;
  titre: string;
  action: string;
  cible: string;
}

export interface ProfileHistory {
  username: string;
  snapshots: number;
  dates: string[];
  elo: (number | null)[];
  games: number[];
  accuracy: (number | null)[];
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
