import type {
  AuthUser,
  DigestResp,
  EtudePayload,
  EtudeStats,
  Exercise,
  GameDetail,
  GamesPage,
  MoveOut,
  Stats,
  SyncStatus,
} from "./types";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(detail && typeof detail === "object" && "detail" in (detail as object)
      ? String((detail as { detail: unknown }).detail)
      : `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers:
      init.body && !(init.body instanceof URLSearchParams)
        ? { "Content-Type": "application/json", ...(init.headers ?? {}) }
        : init.headers,
  });
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = await res.json();
    } catch {
      /* corps non JSON */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const qs = (params: Record<string, string>): string => {
  const q = new URLSearchParams(params).toString();
  return q ? `?${q}` : "";
};

export const api = {
  // ---------------------------------------------------------------- auth
  me: () => request<AuthUser>("/api/auth/users/me"),

  login: (email: string, password: string) =>
    request<void>("/api/auth/jwt/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ username: email, password }),
    }),

  logout: () => request<void>("/api/auth/jwt/logout", { method: "POST" }),

  register: (email: string, password: string, chesscomUsername: string) =>
    request<AuthUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, chesscom_username: chesscomUsername }),
    }),

  // --------------------------------------------------------------- games
  games: (params: Record<string, string> = {}) =>
    request<GamesPage>(`/api/games${qs(params)}`),

  game: (id: number | string) => request<GameDetail>(`/api/games/${id}`),

  gamePgn: (id: number | string) =>
    request<{ pgn: string }>(`/api/games/${id}/pgn`),

  // ---------------------------------------------------------------- stats
  stats: () => request<Stats>("/api/stats"),

  profile: (timeClass = "global") =>
    request<Record<string, unknown>>(`/api/profile${qs({ time_class: timeClass })}`),

  profileAll: (recompute = false) =>
    request<{ profiles: Record<string, Record<string, unknown>> }>(
      `/api/profile/all${qs({ recompute: String(recompute) })}`,
    ),

  profileRecompute: (timeClass = "global") =>
    request<Record<string, unknown>>(`/api/profile/recompute${qs({ time_class: timeClass })}`, {
      method: "POST",
    }),

  profileHistory: (timeClass?: string) =>
    request<Record<string, unknown>>(
      `/api/profile/history${timeClass ? qs({ time_class: timeClass }) : ""}`,
    ),

  digestLatest: () => request<DigestResp | null>("/api/digest/latest"),

  digestGenerate: () =>
    request<DigestResp>("/api/digest/generate", { method: "POST" }),

  // ------------------------------------------------------------- training
  exercices: (concept?: string, nombre = 6, timeClass?: string) =>
    request<Exercise[]>(`/api/exercices${qs({
      nombre: String(nombre),
      ...(concept ? { concept } : {}),
      ...(timeClass ? { time_class: timeClass } : {}),
    })}`),

  moves: (params: Record<string, string> = {}) =>
    request<MoveOut[]>(`/api/moves${qs(params)}`),

  etudeStats: (timeClass?: string) =>
    request<EtudeStats>(`/api/etudes${timeClass ? qs({ time_class: timeClass }) : ""}`),

  recordEtude: (payload: EtudePayload) =>
    request<{ ok: boolean; id: number }>("/api/etudes", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // ----------------------------------------------------------------- sync
  sync: (months = 3) =>
    request<void>("/api/sync", {
      method: "POST",
      body: JSON.stringify({ months }),
    }),

  syncStatus: () => request<SyncStatus>("/api/sync/status"),
};