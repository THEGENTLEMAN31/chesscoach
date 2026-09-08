import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import type { Arrow, CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import { Chess, type Square } from "chess.js";
import { Board } from "../components/Board";
import EvalCurve from "../components/EvalCurve";
import EvalBar from "../components/EvalBar";
import MoveList from "../components/MoveList";
import { Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { CLASS_COLOR, CLASS_LABEL, CONCEPT_LABEL, TIME_CLASS_LABEL, formatClock } from "../lib/constants";
import {
  legalMoveTargets,
  pieceAt,
  tryPlay,
  type Promo,
} from "../lib/game/board";
import { playerWinProb } from "../lib/game/eval";
import type { Settings } from "../lib/game/settings";
import { loadSettings } from "../lib/game/settings";
import { useAnalyse } from "../lib/engine/use-engine";
import { useSession } from "../lib/session";
import type { GameDetail, PlyOut } from "../lib/types";
import { ChevronRightIcon } from "../components/icons";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

type Mode = "engine" | "quiz";

interface LiveEval {
  key: string;
  cp: number | null;
  best: string | null;
  bestSan: string | null;
}

export default function GameReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useSession();
  const [params] = useSearchParams();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [mode, setMode] = useState<Mode>("engine");
  const [quizIndex, setQuizIndex] = useState(0);
  const [proposed, setProposed] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [quizScore, setQuizScore] = useState({ correct: 0, matched: 0, total: 0 });
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [clickSquare, setClickSquare] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [settings] = useState<Settings>(loadSettings);
  const { state: engineState, analyse } = useAnalyse();
  const [live, setLive] = useState<LiveEval | null>(null);
  const [localBest, setLocalBest] = useState<Record<number, string>>({});
  const liveCache = useRef(new Map<string, LiveEval>());
  const localBestCache = useRef(new Map<number, string>());

  const isLocal = !/^\d+$/.test(id ?? "");

  useEffect(() => {
    setGame(null);
    setError(null);
    setSelected(-1);
    setMode("engine");
    setQuizIndex(0);
    setProposed(null);
    setRevealed(false);
    setBoardFen(null);
    setClickSquare(null);
    setPendingPromo(null);
    setQuizScore({ correct: 0, matched: 0, total: 0 });
    const plyParam = Number(params.get("ply"));
    const apply = (g: GameDetail) => {
      setGame(g);
      if (Number.isFinite(plyParam) && g.plies.some((p) => p.ply === plyParam)) {
        setSelected(plyParam);
      }
    };
    if (isLocal) {
      import("../lib/local/repo")
        .then((m) => m.getLocalGameDetail(id!))
        .then((g) => (g ? apply(g) : setError("Partie locale introuvable")))
        .catch((e) => setError(String(e)));
    } else {
      api
        .game(id!)
        .then(apply)
        .catch((e) => setError(String(e)));
    }
  }, [id, params, isLocal]);

  const quizPlies = useMemo(() => {
    if (!game) return [] as PlyOut[];
    return game.plies.filter((p) => p.is_player && p.classification && p.classification !== "book");
  }, [game]);

  const quizPly = useMemo(() => quizPlies[quizIndex] ?? null, [quizPlies, quizIndex]);

  const ply = useMemo(() => {
    if (!game || selected < 0) return null;
    return game.plies.find((p) => p.ply === selected) ?? null;
  }, [game, selected]);

  const baseFen = useMemo(() => {
    if (!game) return START_FEN;
    if (mode === "quiz") return quizPly?.fen_before ?? START_FEN;
    if (!ply) return game.plies[0]?.fen_before ?? START_FEN;
    return ply.fen_after ?? ply.fen_before;
  }, [game, ply, mode, quizPly]);

  useEffect(() => {
    setBoardFen(null);
    setProposed(null);
    setRevealed(false);
    setClickSquare(null);
    setPendingPromo(null);
  }, [baseFen]);

  const position = boardFen ?? baseFen;

  const liveKey = mode === "engine" ? `e:${position}` : `q:${quizPly?.ply ?? ""}:${position}`;

  useEffect(() => {
    if (!engineState.ready || mode !== "engine") return;
    const cached = liveCache.current.get(liveKey);
    if (cached) {
      setLive(cached);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      analyse(position, { movetime: 700, depth: 12 }).then((r) => {
        if (cancelled || !r?.best) return;
        let bestSan: string | null = null;
        if (r.pv[0]) {
          try {
            const b = new Chess(position);
            const mv = b.move(r.pv[0]);
            bestSan = mv.san;
          } catch {
            bestSan = null;
          }
        }
        const entry: LiveEval = { key: liveKey, cp: r.cp, best: r.pv[0] ?? null, bestSan };
        liveCache.current.set(liveKey, entry);
        setLive(entry);
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [liveKey, engineState.ready, mode, position, analyse]);

  useEffect(() => {
    if (mode !== "quiz" || !revealed || !quizPly || quizPly.best_move) return;
    if (localBestCache.current.has(quizPly.ply)) return;
    let cancelled = false;
    analyse(quizPly.fen_before, { movetime: 800, depth: 15 }).then((r) => {
      if (cancelled || !r?.best) return;
      localBestCache.current.set(quizPly.ply, r.best);
      setLocalBest((m) => ({ ...m, [quizPly.ply]: r.best! }));
    });
    return () => {
      cancelled = true;
    };
  }, [mode, revealed, quizPly, analyse]);

  const guessSan = useMemo(() => {
    if (!proposed || !quizPly) return null;
    try {
      const b = new Chess(quizPly.fen_before);
      const mv = b.move({
        from: proposed.slice(0, 2) as Square,
        to: proposed.slice(2, 4) as Square,
        promotion: proposed.length >= 5 ? (proposed[4] as Promo) : undefined,
      });
      return mv ? mv.san : null;
    } catch {
      return null;
    }
  }, [proposed, quizPly]);

  const moveForward = () => {
    if (!game) return;
    const next = selected + 1;
    setSelected(next < game.plies.length ? next : game.plies.length - 1);
  };
  const moveBack = () => {
    setSelected(selected - 1 >= -1 ? selected - 1 : -1);
  };

  useEffect(() => {
    if (mode !== "engine") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") moveForward();
      if (e.key === "ArrowLeft") moveBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, selected, game]);


  const localBestSan = useMemo(() => {
    if (!quizPly || !localBest[quizPly.ply]) return null;
    try {
      const b = new Chess(quizPly.fen_before);
      const mv = b.move(localBest[quizPly.ply]);
      return mv.san;
    } catch {
      return localBest[quizPly.ply];
    }
  }, [quizPly, localBest]);
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={() => navigate("/games")} />
        <Card>
          <p className="text-sm text-muted">Erreur : {error}</p>
        </Card>
      </div>
    );
  }
  if (!game) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onBack={() => navigate("/games")} />
        <Card>
          <p className="text-sm text-muted">Chargement…</p>
        </Card>
      </div>
    );
  }

  const displayPly = mode === "quiz" ? quizPly : ply;

  const playedFrom = displayPly?.uci?.slice(0, 2);
  const playedTo = displayPly?.uci?.slice(2, 4);
  const bestFrom = displayPly?.best_move?.slice(0, 2);
  const bestTo = displayPly?.best_move?.slice(2, 4);

  const squareStyles: CustomSquareStyles = {};
  if (playedFrom) squareStyles[playedFrom as keyof CustomSquareStyles] = { background: "rgba(217,164,65,0.3)" };
  if (playedTo) squareStyles[playedTo as keyof CustomSquareStyles] = { background: "rgba(217,164,65,0.3)" };

  const arrows: Arrow[] = [];
  const reveal = mode === "quiz" ? revealed : true;
  if (reveal && bestFrom && bestTo && settings.showBestArrow) {
    arrows.push([bestFrom as Arrow[0], bestTo as Arrow[1], "#2f7cd6"]);
  }
  if (reveal && playedFrom && playedTo && settings.showPlayedArrow && displayPly?.classification && displayPly.classification !== "book") {
    const c = CLASS_COLOR[displayPly.classification] ?? "#8f97a1";
    arrows.push([playedFrom as Arrow[0], playedTo as Arrow[1], c]);
  }

  const playGuess = (from: Square, to: Square, promo?: Promo) => {
    const start = mode === "quiz" ? quizPly?.fen_before ?? START_FEN : boardFen ?? baseFen;
    if (!start) return;
    const res = tryPlay(start, from, to, promo);
    if (!res) return;
    setProposed(res.uci);
    setBoardFen(res.fen);
    setClickSquare(null);
    if (mode === "quiz" && quizPly) {
      const bestUci = quizPly.best_move ?? localBestCache.current.get(quizPly.ply) ?? null;
      setQuizScore((s) => ({
        ...s,
        total: s.total + 1,
        correct: s.correct + (res.uci === bestUci ? 1 : 0),
        matched: s.matched + (res.uci === quizPly.uci ? 1 : 0),
      }));
      setRevealed(true);
      api
        .recordEtude({
          username: user?.chesscom_username ?? "",
          time_class: game.time_class,
          game_id: game.id,
          ply: quizPly.ply,
          fen: quizPly.fen_before,
          san: quizPly.san,
          best_move_uci: bestUci ?? "",
          best_move_san: quizPly.best_move_san ?? "",
          concept: quizPly.concept ?? undefined,
          attempt: res.uci,
          correct: res.uci === bestUci,
        })
        .catch(() => {});
    }
  };

  const onSquareClick = (square: Square) => {
    if (mode !== "quiz" || revealed || !settings.clickToMove || pendingPromo || !quizPly) return;
    const fen = quizPly.fen_before;
    const stm = fen.split(" ")[1] === "b" ? "b" : "w";
    const piece = pieceAt(fen, square);
    if (!clickSquare) {
      if (piece && piece.color === stm) setClickSquare(square);
      return;
    }
    if (square === clickSquare) {
      setClickSquare(null);
      return;
    }
    if (piece && piece.color === stm) {
      setClickSquare(square);
      return;
    }
    const targets = legalMoveTargets(fen, clickSquare);
    if (!targets.some((t) => t.to === square)) {
      setClickSquare(null);
      return;
    }
    setClickSquare(null);
    const isPawnPromo =
      pieceAt(fen, clickSquare)?.type === "p" && (square[1] === "1" || square[1] === "8");
    if (isPawnPromo) {
      setPendingPromo({ from: clickSquare, to: square });
    } else {
      playGuess(clickSquare, square);
    }
  };

  const onDrop = (source: string, target: string, piece?: string) => {
    if (revealed || pendingPromo) return false;
    const start = mode === "quiz" ? quizPly?.fen_before ?? START_FEN : boardFen ?? baseFen;
    if (!start) return false;
    const from = source as Square;
    const to = target as Square;
    const moving = pieceAt(start, from);
    if (!moving) return false;
    let promotion: Promo | undefined;
    if (moving.type === "p" && (to[1] === "1" || to[1] === "8")) {
      promotion = ((piece?.[1] ?? "q").toLowerCase() as Promo) || "q";
    }
    const res = tryPlay(start, from, to, promotion);
    if (!res) return false;
    playGuess(from, to, promotion);
    return true;
  };

  const nextQuiz = () => {
    setQuizIndex((i) => (i + 1 >= quizPlies.length ? 0 : i + 1));
    setProposed(null);
    setRevealed(false);
    setClickSquare(null);
    setPendingPromo(null);
  };

  const quizAnswer = revealed && proposed ? proposed === (quizPly?.best_move ?? localBest[quizPly.ply] ?? null) : null;


  const back = (
    <button
      onClick={() => navigate("/games")}
      className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
    >
      <ChevronRightIcon className="h-4 w-4 rotate-180" />
      Parties
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {(["engine", "quiz"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {m === "engine" ? "Moteur" : "Teste-toi"}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
          <span>
            <strong className="text-ink">{game.white}</strong>{" "}
            <span className="tabular-nums text-muted">({game.white_elo ?? "?"})</span>
          </span>
          <span className="text-muted">vs</span>
          <span>
            <strong className="text-ink">{game.black}</strong>{" "}
            <span className="tabular-nums text-muted">({game.black_elo ?? "?"})</span>
          </span>
          <span className="rounded-md bg-surface-3 px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
            {game.result}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          {TIME_CLASS_LABEL[game.time_class] ?? game.time_class} ·{" "}
          {game.time_control ?? "—"}
          {game.opening_name ? ` · ${game.opening_name}` : ""}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-muted">
            Précision : <b className="text-ink">{game.accuracy ?? "—"}%</b>
          </span>
          <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-muted">
            ACPL : <b className="text-ink">{game.acpl ?? "—"}</b>
          </span>
          {game.classifications &&
            Object.entries(game.classifications).map(([k, v]) => (
              <span
                key={k}
                className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs"
                style={{ color: CLASS_COLOR[k] ?? "var(--muted)" }}
              >
                {CLASS_LABEL[k] ?? k} : {v}
              </span>
            ))}
        </div>
      </Card>

      {game.plies.length === 0 ? (
        <Card>
          <h2 className="text-sm font-semibold tracking-tight">
            Partie en attente d'analyse
          </h2>
          <p className="mt-1 text-sm text-muted">
            Cette partie vient d'être récupérée depuis chess.com mais le moteur
            ne l'a pas encore analysée. L'analyse est automatique : reviens dans
            quelques minutes pour la revoir.
          </p>
          <Button onClick={() => navigate("/games")} className="mt-3">
            Retour aux parties
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <div className="flex items-start justify-center gap-3">
              <div className="min-w-0 flex-1">
              <Board
                fen={position}
                orientation={game.player_color === "b" ? "black" : "white"}
                draggable={mode === "engine" ? true : !revealed}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                arrows={arrows}
                squareStyles={squareStyles}
                selected={clickSquare}
                pendingPromo={pendingPromo}
                onPromo={(p) => {
                  if (!pendingPromo) return;
                  const { from, to } = pendingPromo;
                  setPendingPromo(null);
                  playGuess(from, to, p);
                }}
              />
              </div>
              {mode === "engine" && !engineState.failed && (
                <div className="shrink-0">
                  <EvalBar
                    wp={
                      live?.cp != null
                        ? playerWinProb({ cp: live.cp, mate: null }, game.player_color)
                        : null
                    }
                    label={
                      engineState.ready
                        ? `${(live?.cp ?? 0) / 100 >= 0 ? "+" : ""}${((live?.cp ?? 0) / 100).toFixed(1)}`
                        : "…"
                    }
                  />
                </div>
              )}
            </div>
            {boardFen && mode === "engine" && (
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  Exploration libre : déplace les pièces pour essayer des coups.
                </p>
                <button
                  onClick={() => setBoardFen(null)}
                  className="shrink-0 text-xs font-medium text-accent hover:underline"
                >
                  Revenir à la partie
                </button>
              </div>
            )}
            {mode === "engine" && (
              <div className="mt-3">
                {engineState.failed ? (
                  <p className="text-xs text-muted">
                    Moteur local indisponible (WASM non chargé). Évaluation serveur
                    uniquement.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-xs text-muted">
                      Évaluation par le moteur local (WASM).
                      {!ply?.best_move_san && live?.bestSan ? (
                        <> Coup suggéré : <b className="text-ink">{live.bestSan}</b></>
                      ) : null}
                    </p>
                  </>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              {mode === "engine" ? (
                <>
                  <button
                    onClick={moveBack}
                    disabled={selected < 0}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-surface-3 disabled:opacity-40"
                    aria-label="Coup précédent"
                  >
                    <ChevronRightIcon className="h-4 w-4 rotate-180" />
                  </button>
                  <span className="text-sm text-muted">
                    {ply ? `coup ${ply.san} (${ply.ply + 1})` : "position initiale"}
                  </span>
                  <button
                    onClick={moveForward}
                    disabled={selected >= game.plies.length - 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-ink transition-colors hover:bg-surface-3 disabled:opacity-40"
                    aria-label="Coup suivant"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <Button onClick={nextQuiz} disabled={quizPlies.length === 0} className="px-3 py-1.5 text-xs">
                    Coup suivant
                  </Button>
                  <span className="text-sm text-muted">
                    {quizPlies.length > 0
                      ? `à ton tour (${quizIndex + 1}/${quizPlies.length})`
                      : "aucun coup à rejouer"}
                  </span>
                </>
              )}
            </div>
          </Card>

          <div className="flex flex-col gap-4">
            {mode === "engine" ? (
              <>
                <Card>
                  <EvalCurve game={game} />
                </Card>
                <Card className="flex flex-col gap-3">
                  {ply?.best_move_san && (
                    <p className="text-sm">
                      Coup suggéré : <b className="text-ink">{ply.best_move_san}</b>
                    </p>
                  )}
                  {ply?.concept && (
                    <p className="text-sm">
                      Concept : <b className="text-accent">{CONCEPT_LABEL[ply.concept] ?? ply.concept}</b>
                    </p>
                  )}
                  {ply?.time_taken !== null && ply?.time_taken !== undefined && (
                    <p className="text-xs text-muted">
                      Temps de réflexion : {formatClock(ply.time_taken)}
                    </p>
                  )}
                  <MoveList plies={game.plies} selectedPly={selected} onSelect={setSelected} />
                </Card>
              </>
            ) : (
              <Card>
                <h2 className="text-sm font-semibold tracking-tight">Teste-toi</h2>
                {quizPlies.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">Aucun coup à rejouer dans cette partie.</p>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted">
                      Rejoue ce coup toi-même avant de voir ce que tu as joué et ce
                      que disait le moteur.
                      {settings.clickToMove
                        ? " Clique une pièce puis sa case d'arrivée."
                        : " Déplace une pièce sur l'échiquier."}
                    </p>
                    {!revealed ? (
                      <p className="mt-3 text-sm">
                        {proposed ? (
                          <>
                            Ton coup : <b className="text-ink">{guessSan ?? proposed}</b>
                          </>
                        ) : (
                          <span className="text-muted">En attente d'un coup sur l'échiquier…</span>
                        )}
                      </p>
                    ) : (
                      <div className="mt-3 flex flex-col gap-1.5 text-sm">
                        <p className={quizAnswer ? "font-medium text-[#3fb562]" : "font-medium text-[#d9534f]"}>
                          {quizAnswer
                            ? "Bien vu : tu as trouvé le coup du moteur !"
                            : "Pas tout à fait…"}
                        </p>
                        <p>
                          Coup joué : <b className="text-ink">{quizPly?.san}</b>
                        </p>
                        <p>
                          Coup du moteur : <b className="text-ink">{quizPly?.best_move_san ?? localBestSan ?? "—"}</b>
                        </p>
                        {quizPly?.concept && (
                          <p className="text-xs text-accent">
                            Concept : {CONCEPT_LABEL[quizPly.concept] ?? quizPly.concept}
                          </p>
                        )}
                        {quizPly?.classification && (
                          <p style={{ color: CLASS_COLOR[quizPly.classification] }}>
                            Classement : {CLASS_LABEL[quizPly.classification]}
                          </p>
                        )}
                        {quizPly && quizPly.cp_loss !== null && quizPly.cp_loss !== undefined && (
                          <p className="text-xs text-muted">
                            Perte :{" "}
                            {settings.evalDisplay === "winprob" && quizPly.winprob_loss !== null
                              ? `${quizPly.winprob_loss} pts de probabilité`
                              : `${(quizPly.cp_loss / 100).toFixed(1)} pions`}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                          <span>
                            <b className="text-ink">{quizScore.correct}</b> coup du moteur
                          </span>
                          <span>
                            <b className="text-ink">{quizScore.matched}</b> coup réellement joué
                          </span>
                          <span>
                            sur <b className="text-ink">{quizScore.total}</b> essais
                          </span>
                        </div>
                        <Button onClick={nextQuiz} className="mt-2 w-max px-3 py-1.5 text-xs">
                          Coup suivant
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
    >
      <ChevronRightIcon className="h-4 w-4 rotate-180" />
      Parties
    </button>
  );
}