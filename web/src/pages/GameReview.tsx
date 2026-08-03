import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import type { Arrow, CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import { TouchBackend } from "react-dnd-touch-backend";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Chess, type Square } from "chess.js";
import type { GameDetail, PlyOut } from "../types";
import { api, timeClassLabel, formatDate } from "../api";
import { CLASS_LABEL, CLASS_COLOR, CONCEPT_LABEL } from "../constants";
import EvalCurve from "../components/EvalCurve";
import MoveList from "../components/MoveList";
import { legalMoveTargets, legalSquareStyles, pieceAt, tryPlay, type Promo } from "../board";
import { loadSettings } from "../settings";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const isTouchDevice =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

type Mode = "engine" | "quiz";

function GameHeader({
  game,
  mode,
  setMode,
  onBack,
}: {
  game: GameDetail;
  mode: Mode;
  setMode: (m: Mode) => void;
  onBack: () => void;
}) {
  return (
    <div className="game-header card">
      <button className="back" onClick={onBack}>
        ← Parties
      </button>
      <div className="players">
        <span>
          <strong>{game.white}</strong> ({game.white_elo ?? "?"})
        </span>
        <span className="vs"> vs </span>
        <span>
          <strong>{game.black}</strong> ({game.black_elo ?? "?"})
        </span>
        <span className="result">{game.result}</span>
      </div>
      <div className="meta">
        {timeClassLabel[game.time_class] ?? game.time_class} · {game.time_control ?? "—"} ·{" "}
        {formatDate(game.end_time)}
        {game.opening_name && <span> · {game.opening_name}</span>}
        {game.eco && <span> ({game.eco})</span>}
      </div>
      <div className="chips">
        <span className="chip">
          Précision : <b>{game.accuracy ?? "—"}%</b>
        </span>
        <span className="chip">
          ACPL : <b>{game.acpl ?? "—"}</b>
        </span>
        {game.classifications &&
          Object.entries(game.classifications).map(([k, v]) => (
            <span key={k} className="chip" style={{ color: CLASS_COLOR[k] }}>
              {CLASS_LABEL[k] ?? k} : {v}
            </span>
          ))}
      </div>
      <div className="chips">
        <span className="chip">
          Mode :{" "}
          <button
            className={`mode-btn${mode === "engine" ? " active" : ""}`}
            onClick={() => setMode("engine")}
          >
            Moteur
          </button>
          <button
            className={`mode-btn${mode === "quiz" ? " active" : ""}`}
            onClick={() => setMode("quiz")}
          >
            Teste-toi
          </button>
        </span>
      </div>
    </div>
  );
}

export default function GameReview() {
  const { id } = useParams();
  const navigate = useNavigate();
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
  const [settings] = useState(loadSettings);

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
    api
      .game(id!)
      .then((g) => {
        setGame(g);
        if (Number.isFinite(plyParam) && g.plies.some((p) => p.ply === plyParam)) {
          setSelected(plyParam);
        }
      })
      .catch((e) => setError(String(e)));
  }, [id, params]);

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

  if (error) return <div className="card">Erreur : {error}</div>;
  if (!game) return <div className="card">Chargement…</div>;

  const displayPly = mode === "quiz" ? quizPly : ply;

  const playedFrom = displayPly?.uci?.slice(0, 2);
  const playedTo = displayPly?.uci?.slice(2, 4);
  const bestFrom = displayPly?.best_move?.slice(0, 2);
  const bestTo = displayPly?.best_move?.slice(2, 4);

  const squareStyles: CustomSquareStyles = {};
  const hintStyles =
    mode === "quiz" && settings.clickToMove && settings.showLegalMoves && !revealed && clickSquare
      ? legalSquareStyles(
          legalMoveTargets(quizPly?.fen_before ?? START_FEN, clickSquare),
          clickSquare,
        )
      : {};
  Object.assign(squareStyles, hintStyles);
  if (playedFrom) squareStyles[playedFrom as keyof CustomSquareStyles] = { background: "rgba(250,204,21,0.35)" };
  if (playedTo) squareStyles[playedTo as keyof CustomSquareStyles] = { background: "rgba(250,204,21,0.35)" };

  const arrows: Arrow[] = [];
  const reveal = mode === "quiz" ? revealed : true;
  if (reveal && bestFrom && bestTo) {
    arrows.push([bestFrom as Arrow[0], bestTo as Arrow[1], "#2f7cd6"]);
  }
  if (reveal && playedFrom && playedTo && displayPly?.classification && displayPly.classification !== "book") {
    const c = CLASS_COLOR[displayPly.classification] ?? "#94a3b8";
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
      setQuizScore((s) => ({
        ...s,
        total: s.total + 1,
        correct: s.correct + (res.uci === quizPly.best_move ? 1 : 0),
        matched: s.matched + (res.uci === quizPly.uci ? 1 : 0),
      }));
      setRevealed(true);
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

  const quizAnswer = revealed && proposed ? proposed === quizPly?.best_move : null;

  return (
    <div className="review">
      <GameHeader
        game={game}
        mode={mode}
        setMode={setMode}
        onBack={() => navigate("/games")}
      />
      {game.plies.length === 0 ? (
        <div className="card empty-state">
          <h3>Partie en attente d'analyse</h3>
          <p className="muted">
            Cette partie vient d'être récupérée depuis chess.com mais le moteur ne l'a pas encore
            analysée. L'analyse est automatique : reviens dans quelques minutes pour la revoir.
          </p>
          <button onClick={() => navigate("/games")}>Retour aux parties</button>
        </div>
      ) : (
        <div className="board-layout">
          <div className="board card">
            <div className="board-wrap">
              <Chessboard
                position={position}
                boardOrientation={game.player_color === "b" ? "black" : "white"}
                arePiecesDraggable
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customArrows={arrows}
                customSquareStyles={squareStyles}
                customLightSquareStyle={{ backgroundColor: "#f2f2f0" }}
                customDarkSquareStyle={{ backgroundColor: "#cbcbc7" }}
                customDndBackend={isTouchDevice ? TouchBackend : HTML5Backend}
                customDndBackendOptions={isTouchDevice ? { enableMouseEvents: true } : undefined}
              />
              {pendingPromo && (
                <div className="promo-overlay">
                  <span className="promo-title">Choisis la pièce de promotion</span>
                  <div className="promo-pieces">
                    {(["q", "r", "n", "b"] as Promo[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          const { from, to } = pendingPromo;
                          setPendingPromo(null);
                          playGuess(from, to, p);
                        }}
                      >
                        {p === "q" ? "♕" : p === "r" ? "♖" : p === "n" ? "♘" : "♗"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {boardFen && mode === "engine" && (
              <div className="explore-hint">
                Exploration libre : déplace les pièces pour essayer des coups.
                <button className="explore-back" onClick={() => setBoardFen(null)}>
                  Revenir à la partie
                </button>
              </div>
            )}
            <div className="board-nav">
              {mode === "engine" ? (
                <>
                  <button onClick={moveBack} disabled={selected < 0}>
                    ◀
                  </button>
                  <span>
                    {ply ? `coup ${ply.san} (${ply.ply + 1})` : "position initiale"}
                  </span>
                  <button onClick={moveForward} disabled={selected >= game.plies.length - 1}>
                    ▶
                  </button>
                </>
              ) : (
                <>
                  <button onClick={nextQuiz} disabled={quizPlies.length === 0}>
                    Coup suivant ▶
                  </button>
                  <span>
                    {quizPlies.length > 0
                      ? `à ton tour (${quizIndex + 1}/${quizPlies.length})`
                      : "aucun coup à rejouer"}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="side card">
            {mode === "engine" ? (
              <>
                <EvalCurve game={game} selectedPly={selected} onSelect={setSelected} />
                {ply?.best_move_san && (
                  <div className="best-move">
                    Coup suggéré : <b>{ply.best_move_san}</b>
                  </div>
                )}
                {ply?.concept && (
                  <div className="best-move concept">
                    Concept : {CLASS_LABEL[ply.concept] ?? ply.concept}
                  </div>
                )}
                <MoveList plies={game.plies} selectedPly={selected} onSelect={setSelected} />
              </>
            ) : (
              <div className="quiz-panel">
                <h3>Teste-toi</h3>
                {quizPlies.length === 0 ? (
                  <p className="muted">Aucun coup à rejouer dans cette partie.</p>
                ) : (
                  <>
                    <p className="muted">
                      Rejoue ce coup toi-même avant de voir ce que tu as joué et ce que disait le
                      moteur.
                      {settings.clickToMove
                        ? " Clique une pièce puis sa case d'arrivée."
                        : " Déplace une pièce sur l'échiquier."}
                    </p>
                    {!revealed ? (
                      <>
                        {proposed ? (
                          <p>
                            Ton coup : <b>{guessSan ?? proposed}</b>
                          </p>
                        ) : (
                          <p className="muted">En attente d'un coup sur l'échiquier…</p>
                        )}
                      </>
                    ) : (
                      <div className="quiz-result">
                        <p className={quizAnswer ? "good" : "bad"}>
                          {quizAnswer
                            ? "Bien vu : tu as trouvé le coup du moteur !"
                            : "Pas tout à fait…"}
                        </p>
                        <p>
                          Coup joué : <b>{quizPly?.san}</b>
                        </p>
                        <p>
                          Coup du moteur : <b>{quizPly?.best_move_san ?? "—"}</b>
                        </p>
                        {quizPly?.concept && (
                          <p className="concept-label">
                            Concept : {CONCEPT_LABEL[quizPly.concept] ?? quizPly.concept}
                          </p>
                        )}
                        {quizPly?.classification && (
                          <p style={{ color: CLASS_COLOR[quizPly.classification] }}>
                            Classement : {CLASS_LABEL[quizPly.classification]}
                          </p>
                        )}
                        {quizPly && quizPly.cp_loss !== null && quizPly.cp_loss !== undefined && (
                          <p className="muted">
                            Perte :{" "}
                            {settings.evalDisplay === "winprob" && quizPly.winprob_loss !== null
                              ? `${quizPly.winprob_loss} pts de probabilité`
                              : `${(quizPly.cp_loss / 100).toFixed(1)} pions`}
                          </p>
                        )}
                        <div className="quiz-score">
                          <span>
                            <b>{quizScore.correct}</b> coup du moteur trouvé
                          </span>
                          <span>
                            <b>{quizScore.matched}</b> coup réellement joué
                          </span>
                          <span>
                            sur <b>{quizScore.total}</b> essais
                          </span>
                        </div>
                        <button onClick={nextQuiz}>Coup suivant ▶</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
