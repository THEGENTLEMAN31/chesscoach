import type { GameDetail, GameOut, Stats, SyncStatus } from "./types";

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

export const api = {
  games: (params: Record<string, string> = {}) => {
    const q = new URLSearchParams(params).toString();
    return get<GameOut[]>(`/api/games${q ? `?${q}` : ""}`);
  },
  game: (id: number | string) => get<GameDetail>(`/api/games/${id}`),
  stats: (username = "thegentleman31") =>
    get<Stats>(`/api/stats?username=${username}`),
  syncStatus: () => get<SyncStatus>("/api/sync/status"),
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
