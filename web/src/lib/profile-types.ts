export interface ProfileItem {
  label: string;
  detail?: string;
  value?: string | number;
  cible?: string;
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

export interface PlayerProfile {
  username: string;
  time_class?: string;
  computed_at: string;
  games: {
    n: number;
    by_time_class: Record<string, number>;
    first_game: string | null;
    last_game: string | null;
  };
  rating: { min: number | null; max: number | null; latest: number | null };
  progress: {
    elo_curve: { date: string; elo: number }[];
    elo_trend: number | null;
    accuracy_trend: number | null;
  };
  objective: {
    target_elo: number | null;
    gap: number | null;
    months_estimated: number | null;
    progression_pct: number | null;
    targets?: Record<string, number>;
  };
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
  conversion: {
    won_positions: number;
    won_blown: number;
    conversion_rate: number;
    lost_positions: number;
    lost_saved: number;
  };
  cognitive: string[];
  trends: {
    improving: ProfileTrend[];
    worsening: ProfileTrend[];
    recent_games_30d: number;
  };
  recommendations: ProfileRecommendation[];
  etudes?: EtudeOpts;
}

export interface EtudeOpts {
  n: number;
  correct: number;
  correct_rate: number;
  first_at: string | null;
  last_at: string | null;
}

export interface ProfileRecommendation {
  priority: string;
  titre: string;
  action: string;
  cible: string;
}