import type {
  Exercise,
  GameDetail,
  GamesPage,
  MoveOut,
  PlayerProfile,
  ProfilesAll,
  ProfileHistory,
  Stats,
  SyncStatus,
} from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export interface EtudePayload {
  username: string;
  time_class?: string;
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

export const api = {
  games: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<GamesPage>(`/api/games${q ? `?${q}` : ""}`);
  },
  game: (id: number | string) => get<GameDetail>(`/api/games/${id}`),
  stats: (username = "thegentleman31") =>
    get<Stats>(`/api/stats?username=${username}`),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
  profile: (username = "thegentleman31") =>
    get<PlayerProfile>(`/api/profile/${username}`),
  profileAll: (username = "thegentleman31", recompute = false) =>
    get<ProfilesAll>(`/api/profile/${username}/all${recompute ? "?recompute=true" : ""}`),
  profileByClass: (username = "thegentleman31", timeClass = "global") =>
    get<PlayerProfile>(`/api/profile/${username}?time_class=${timeClass}`),
  profileRecompute: (username = "thegentleman31", timeClass = "global") =>
    fetch(`/api/profile/${username}/recompute?time_class=${timeClass}`, {
      method: "POST",
    }).then((r) => r.json() as Promise<PlayerProfile>),
  profileHistory: (username = "thegentleman31", timeClass?: string) =>
    get<ProfileHistory>(
      `/api/profile/${username}/history${timeClass ? `?time_class=${timeClass}` : ""}`,
    ),
  exercices: (concept?: string, nombre = 8, timeClass?: string) => {
    const q = new URLSearchParams({ nombre: String(nombre) });
    if (concept) q.set("concept", concept);
    if (timeClass) q.set("time_class", timeClass);
    return get<Exercise[]>(`/api/exercices?${q.toString()}`);
  },
  moves: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<MoveOut[]>(`/api/moves${q ? `?${q}` : ""}`);
  },
  recordEtude: (payload: EtudePayload) =>
    fetch("/api/etudes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  etudeStats: (username = "thegentleman31", timeClass?: string) =>
    get(`/api/etudes?username=${username}${timeClass ? `&time_class=${timeClass}` : ""}`),
  sync: (months = 1) =>
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months }),
    }),
};

export const timeClassLabel: Record<string, string> = {
  rapid: "Rapide",
  blitz: "Blitz",
  bullet: "Bullet",
  daily: "Journalier",
};

export function formatDate(epochSec: number | null): string {
  if (!epochSec) return "—";
  return new Date(epochSec * 1000).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatClock(sec: number | null): string {
  if (sec === null || sec === undefined) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m${s.toString().padStart(2, "0")}` : `${s}s`;
}
