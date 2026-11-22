export interface EngineInfo {
  depth: number;
  seldepth?: number;
  multiPv: number;
  scoreCp: number | null;
  scoreMate: number | null;
  pv: string[];
  nodes?: number;
  nps?: number;
}

export interface BestMoveResult {
  best: string | null;
  ponder?: string;
}

export interface GoOptions {
  depth?: number;
  movetime?: number;
  nodes?: number;
  searchMoves?: string[];
}

const INFO_RE =
  /^info\s+.*\bdepth\s+(\d+)(?:\s+seldepth\s+(\d+))?(?:\s+multipv\s+(\d+))?.*?\bscore\s+(cp\s+(-?\d+)|mate\s+(-?\d+))(?:\s+.*?\bnodes\s+(\d+))?(?:\s+.*?\bnps\s+(\d+))?(?:\s+.*?\bpv\s+(.+))?$/;

export function parseInfo(line: string): EngineInfo | null {
  const m = line.match(INFO_RE);
  if (!m) return null;
  return {
    depth: Number(m[1]),
    seldepth: m[2] ? Number(m[2]) : undefined,
    multiPv: m[3] ? Number(m[3]) : 1,
    scoreCp: m[5] ? Number(m[5]) : null,
    scoreMate: m[6] ? Number(m[6]) : null,
    pv: m[9] ? m[9].trim().split(/\s+/) : [],
    nodes: m[7] ? Number(m[7]) : undefined,
    nps: m[8] ? Number(m[8]) : undefined,
  };
}

export function parseBestMove(line: string): BestMoveResult | null {
  if (!line.startsWith("bestmove")) return null;
  const p = line.split(/\s+/);
  const best = p[1] === "(none)" ? null : p[1];
  const ponderIdx = p.indexOf("ponder");
  return { best, ponder: ponderIdx >= 0 ? p[ponderIdx + 1] : undefined };
}

/** Score unifié en centipawns (mate converti en large/valeur bornée), perspective du trait. */
export function uciScore(info: EngineInfo): number | null {
  if (info.scoreMate !== null) {
    return info.scoreMate > 0 ? 100000 - info.scoreMate : -100000 - info.scoreMate;
  }
  return info.scoreCp;
}

/** Camp au trait d'une FEN. */
export function stmOf(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

/** Convertit un score "perspective du trait" en perspective Blancs. */
export function toWhite(cp: number | null, stm: "w" | "b"): number | null {
  if (cp === null) return null;
  return stm === "w" ? cp : -cp;
}

/** Score "perspective du trait" -> perspective du joueur `side`. */
export function toSide(cp: number | null, stm: "w" | "b", side: "w" | "b"): number | null {
  return toWhite(cp, stm) === null ? null : (side === "w" ? toWhite(cp, stm) : -(toWhite(cp, stm) as number));
}

// On charge `stockfish.js` DIRECTEMENT comme Worker (pas de wrapper). Ainsi son
// wasm est dérivé de son propre nom (`stockfish.js` -> `stockfish.wasm`), fichier
// qui a toujours été servi correctement. Le `?v=` buste tout cache d'ancienne
// version, et le hash fournit explicitement le chemin du wasm.
const ENGINE_VERSION = "18";
const ENGINE_WORKER_URL = () => {
  const origin = typeof location !== "undefined" ? location.origin : "";
  const wasm = `${origin}/engine/stockfish.wasm`;
  return `${origin}/engine/stockfish.js?v=${ENGINE_VERSION}#${wasm}`;
};

interface Job {
  fen: string;
  moves: string[];
  go: GoOptions;
  multiPv: number;
  onInfo?: (infos: EngineInfo[], pv: string[]) => void;
  resolve: (r: { best: string | null; ponder?: string; infos: EngineInfo[] }) => void;
  reject: (e: Error) => void;
  infos: EngineInfo[];
}

const SEARCH_TIMEOUT_MS = 45_000;
const BOOT_TIMEOUT_MS = 60_000;

export class EngineWorker {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private active: Job | null = null;
  private queue: Job[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private bootMultiPv: number;

  constructor(multiPv = 1, hashMb = 16) {
    this.bootMultiPv = multiPv;
    this.worker = new Worker(ENGINE_WORKER_URL());
    this.readyPromise = this.boot(hashMb);
  }

  private boot(hashMb: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const readyListener = (e: MessageEvent) => {
        const data = e.data;
        if (typeof data !== "string") return;
        if (data.startsWith("uciok")) {
          this.worker.removeEventListener("message", readyListener);
          this.worker.addEventListener("message", this.onMessage);
          this.worker.postMessage(`setoption name MultiPV value ${this.bootMultiPv}`);
          this.worker.postMessage(`setoption name Hash value ${hashMb}`);
          resolve();
        }
      };
      const fail = (reason?: unknown) => {
        this.worker.removeEventListener("message", readyListener);
        clearTimeout(timer);
        reject(new Error(reason instanceof Error ? reason.message : "Initialisation du moteur échouée"));
      };
      const timer = setTimeout(() => fail(new Error("Délai d'initialisation du moteur dépassé (60s)")), BOOT_TIMEOUT_MS);
      this.worker.addEventListener("message", readyListener);
      this.worker.addEventListener("error", () => fail(new Error("Le moteur WASM n'a pas pu être chargé (erreur worker)")));
      this.worker.postMessage("uci");
    });
  }

  get ready(): Promise<void> {
    return this.readyPromise;
  }

  private onMessage = (e: MessageEvent) => {
    const data = e.data;
    if (typeof data !== "string") return;
    const line = data.trim();
    const job = this.active;
    if (!job) return;
    const info = parseInfo(line);
    if (info) {
      if (info.pv.length) this.feedInfo(job, info);
      return;
    }
    const best = parseBestMove(line);
    if (best) this.finish(job, best);
  };

  private feedInfo(job: Job, info: EngineInfo): void {
    const idx = job.infos.findIndex((i) => i.multiPv === info.multiPv);
    if (idx >= 0) job.infos[idx] = info;
    else job.infos.push(info);
    job.onInfo?.(job.infos.slice().sort((a, b) => a.multiPv - b.multiPv), info.pv);
  }

  private finish(job: Job, best: BestMoveResult): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.active = null;
    job.resolve({
      best: best.best,
      ponder: best.ponder,
      infos: job.infos.slice().sort((a, b) => a.multiPv - b.multiPv),
    });
    this.pump();
  }

  /** Exécute les jobs un par un : `position` puis `go` sont atomiques. */
  private pump(): void {
    if (this.active || this.queue.length === 0) return;
    const job = this.queue.shift() as Job;
    this.active = job;
    this.worker.postMessage(`setoption name MultiPV value ${job.multiPv}`);
    const pos = job.moves.length
      ? `position fen ${job.fen} moves ${job.moves.join(" ")}`
      : `position fen ${job.fen}`;
    this.worker.postMessage(pos);
    this.timer = setTimeout(() => {
      if (this.active !== job) return;
      this.worker.postMessage("stop");
      this.active = null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      job.reject(new Error("search timeout"));
      this.pump();
    }, SEARCH_TIMEOUT_MS);
    const parts = [
      "go",
      job.go.searchMoves?.length ? `searchmoves ${job.go.searchMoves.join(" ")}` : null,
      job.go.depth ? `depth ${job.go.depth}` : null,
      job.go.movetime ? `movetime ${job.go.movetime}` : null,
      job.go.nodes ? `nodes ${job.go.nodes}` : null,
    ].filter(Boolean);
    this.worker.postMessage(parts.join(" "));
  }

  /** Lance une recherche UCI, sérialisée avec les autres. */
  private run(
    fen: string,
    go: GoOptions,
    multiPv: number,
    onInfo?: (infos: EngineInfo[], pv: string[]) => void,
    moves: string[] = [],
  ): Promise<{ best: string | null; ponder?: string; infos: EngineInfo[] }> {
    return new Promise((resolve, reject) => {
      this.queue.push({ fen, moves, go, multiPv, onInfo, resolve, reject, infos: [] });
      if (this.readyPromise) {
        this.readyPromise.then(() => this.pump()).catch(() => {});
      } else {
        this.pump();
      }
    });
  }

  /** Recherche rapide bornée : cp renvoyé en perspective du trait (raw UCI). */
  async quickEval(
    fen: string,
    opts: GoOptions = { movetime: 350 },
  ): Promise<{ cp: number | null; mate: number | null; pv: string[]; best: string | null } | null> {
    try {
      const r = await this.run(fen, opts, 1);
      const info = r.infos[r.infos.length - 1];
      if (!info) return { cp: null, mate: null, pv: [], best: r.best };
      return { cp: uciScore(info), mate: info.scoreMate, pv: info.pv, best: r.best };
    } catch {
      return null;
    }
  }

  /** Évaluation + mate brut + bestmove pour une position (analyse import). */
  async evalFen(
    fen: string,
    opts: GoOptions = { movetime: 400, depth: 12 },
  ): Promise<{ cp: number; mate: number | null; best: string | null; pv: string[] } | null> {
    try {
      const r = await this.run(fen, opts, 1);
      const l = r.infos[r.infos.length - 1];
      return { cp: l ? (uciScore(l) ?? 0) : 0, mate: l?.scoreMate ?? null, best: r.best, pv: l?.pv ?? [] };
    } catch {
      return null;
    }
  }

  /** Meilleurs `multipv` coups de la position (une seule recherche, perspective du trait). */
  async analyseMultiPv(
    fen: string,
    opts: GoOptions = { depth: 12, movetime: 600 },
    multipv = 5,
  ): Promise<{ best: string | null; lines: EngineInfo[] } | null> {
    try {
      const r = await this.run(fen, opts, Math.max(1, multipv));
      return { best: r.best, lines: r.infos.filter((i) => i.pv.length > 0) };
    } catch {
      return null;
    }
  }

  /** Vérifie que `uciMove` est le meilleur coup à fen donnée. */
  async checkSolution(
    fen: string,
    uciMove: string,
    opts: GoOptions = { movetime: 700, depth: 16 },
  ): Promise<{ isBest: boolean; best: string | null }> {
    try {
      const r = await this.run(fen, opts, 1);
      return { isBest: r.best === uciMove, best: r.best };
    } catch {
      return { isBest: false, best: null };
    }
  }

  stop(): void {
    this.worker.postMessage("stop");
  }

  cancelAll(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.worker.postMessage("stop");
    if (this.active) {
      this.active.reject(new Error("aborted"));
      this.active = null;
    }
    for (const q of this.queue) q.reject(new Error("aborted"));
    this.queue = [];
  }

  async dispose(): Promise<void> {
    this.cancelAll();
    try {
      this.worker.postMessage("quit");
    } catch {
      /* noop */
    }
    setTimeout(() => this.worker.terminate(), 50);
  }
}
