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
    pv: m[8] ? m[8].trim().split(/\s+/) : [],
    nodes: m[7] ? Number(m[7]) : undefined,
    nps: m[9] ? Number(m[9]) : undefined,
  };
}

export function parseBestMove(line: string): BestMoveResult | null {
  if (!line.startsWith("bestmove")) return null;
  const p = line.split(/\s+/);
  const best = p[1] === "(none)" ? null : p[1];
  const ponderIdx = p.indexOf("ponder");
  return { best, ponder: ponderIdx >= 0 ? p[ponderIdx + 1] : undefined };
}

/** Score unifié en centipawns (mate converti en large/valeur bornée). */
export function uciScore(info: EngineInfo): number | null {
  if (info.scoreMate !== null) {
    return info.scoreMate > 0 ? 100000 - info.scoreMate : -100000 - info.scoreMate;
  }
  return info.scoreCp;
}

const ENGINE_WORKER_URL = () => {
  const origin = typeof location !== "undefined" ? location.origin : "";
  return `${origin}/engine/worker.js#${origin}/engine/stockfish.wasm`;
};

interface Pending {
  go: GoOptions;
  onInfo: (info: EngineInfo[], pv: string[]) => void;
  best: (r: BestMoveResult) => void;
  reject: (e: Error) => void;
  infos: EngineInfo[];
}

const SEARCH_TIMEOUT_MS = 45_000;
const BOOT_TIMEOUT_MS = 15_000;

export class EngineWorker {
  private worker: Worker;
  private readyPromise: Promise<void>;
  private current: Pending | null = null;
  private queued: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(multiPv = 1, hashMb = 16) {
    this.worker = new Worker(ENGINE_WORKER_URL());
    this.readyPromise = this.boot(multiPv, hashMb);
  }

  private boot(multiPv: number, hashMb: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const readyListener = (e: MessageEvent) => {
        const data = e.data;
        if (typeof data !== "string") return;
        if (data.startsWith("uciok")) {
          this.worker.removeEventListener("message", readyListener);
          this.worker.addEventListener("message", this.onMessage);
          this.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
          this.worker.postMessage(`setoption name Hash value ${hashMb}`);
          resolve();
        }
      };
      const fail = (reason?: unknown) => {
        this.worker.removeEventListener("message", readyListener);
        clearTimeout(timer);
        reject(new Error(reason instanceof Error ? reason.message : "Initialisation du moteur échouée"));
      };
      const timer = setTimeout(() => fail(new Error("Délai d'initialisation du moteur dépassé")), BOOT_TIMEOUT_MS);
      this.worker.addEventListener("message", readyListener);
      this.worker.addEventListener("error", () => fail(new Error("Le moteur WASM n'a pas pu être chargé")));
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
    if (!this.current) return;
    const info = parseInfo(line);
    if (info) {
      if (info.pv.length) this.feedInfo(this.current, info);
      return;
    }
    const best = parseBestMove(line);
    if (best) this.finish(best);
  };

  private feedInfo(pending: Pending, info: EngineInfo): void {
    const last = pending.infos.find((i) => i.multiPv === info.multiPv);
    if (last) Object.assign(last, info);
    else pending.infos.push(info);
    pending.onInfo(pending.infos, info.pv);
  }

  private finish(best: BestMoveResult): void {
    if (!this.current) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const cur = this.current;
    this.current = null;
    cur.best(best);
    const next = this.queued.shift();
    if (next) this.launch(next);
  }

  async setPosition(fen: string, moves: string[] = []): Promise<void> {
    await this.ready;
    const line = moves.length
      ? `position fen ${fen} moves ${moves.join(" ")}`
      : `position fen ${fen}`;
    this.worker.postMessage(line);
  }

  private launchGo(go: GoOptions): void {
    const parts = [
      "go",
      go.searchMoves?.length ? `searchmoves ${go.searchMoves.join(" ")}` : null,
      go.depth ? `depth ${go.depth}` : null,
      go.movetime ? `movetime ${go.movetime}` : null,
      go.nodes ? `nodes ${go.nodes}` : null,
    ].filter(Boolean);
    this.worker.postMessage(parts.join(" "));
  }

  private launch(pending: Pending): void {
    this.current = pending;
    this.timer = setTimeout(() => {
      if (!this.current) return;
      this.worker.postMessage("stop");
      const cur = this.current;
      this.current = null;
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      cur.reject(new Error("search timeout"));
      const next = this.queued.shift();
      if (next) this.launch(next);
    }, SEARCH_TIMEOUT_MS);
    this.launchGo(pending.go);
  }

  /** Lance une recherche UCI. bestmove résolu, infos diffusées en direct. */
  go(
    go: GoOptions,
    onInfo: (info: EngineInfo[], pv: string[]) => void = () => {},
  ): Promise<BestMoveResult> {
    return new Promise<BestMoveResult>((resolve, reject) => {
      const pending: Pending = {
        go,
        onInfo,
        best: resolve,
        reject,
        infos: [],
      };
      if (this.current) this.queued.push(pending);
      else this.launch(pending);
    });
  }

  /** Recherche rapide bornée : retourne le score (centipawns, vue Blanc) et la PV. */
  async quickEval(
    fen: string,
    opts: GoOptions = { movetime: 600 },
  ): Promise<{ cp: number | null; pv: string[]; best: string | null } | null> {
    try {
      await this.setPosition(fen);
      const holder: { last: EngineInfo | null } = { last: null };
      const info = await this.go(opts, (all) => {
        holder.last = all[all.length - 1] ?? null;
      });
      if (!info.best) return null;
      return {
        cp: holder.last ? uciScore(holder.last) : null,
        pv: holder.last?.pv ?? [],
        best: info.best,
      };
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
      await this.setPosition(fen);
      const holder: { last: EngineInfo | null } = { last: null };
      const info = await this.go(opts, (all) => {
        holder.last = all[all.length - 1] ?? null;
      });
      if (!info.best) return null;
      const l = holder.last;
      return {
        cp: l ? (uciScore(l) ?? 0) : 0,
        mate: l?.scoreMate ?? null,
        best: info.best,
        pv: l?.pv ?? [],
      };
    } catch {
      return null;
    }
  }

  /** Vérifie que « uciMove » est meilleur coup à fen donnée (weak = coup raisonnable). */
  async checkSolution(
    fen: string,
    uciMove: string,
    opts: GoOptions = { movetime: 700, depth: 16 },
  ): Promise<{ isBest: boolean; best: string | null }> {
    try {
      await this.setPosition(fen);
      const res = await this.go({ ...opts, searchMoves: [uciMove] });
      return { isBest: res.best === uciMove, best: res.best };
    } catch {
      return { isBest: false, best: null };
    }
  }

  stop(): void {
    this.worker.postMessage("stop");
  }

  async dispose(): Promise<void> {
    try {
      this.worker.postMessage("quit");
    } catch {
      /* noop */
    }
    setTimeout(() => this.worker.terminate(), 50);
  }
}