import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import type { Arrow, CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import { TouchBackend } from "react-dnd-touch-backend";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Chess, type Square } from "chess.js";
import type { Exercise, PlayerProfile } from "../types";
import { api, formatDate } from "../api";
import { CONCEPT_LABEL, CONCEPT_LIST } from "../constants";
import {
  legalMoveTargets,
  legalSquareStyles,
  pieceAt,
  sideToMove,
  tryPlay,
  type Promo,
} from "../board";
import { loadSettings } from "../settings";

type PendingPromo = { from: Square; to: Square } | null;

const isTouchDevice =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export default function Practice() {
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [concept, setConcept] = useState(searchParams.get("concept") ?? "");
  const [idx, setIdx] = useState(0);
  const [proposed, setProposed] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [err, setErr] = useState<string | null>(null);
  const [boardFen, setBoardFen] = useState<string | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromo, setPendingPromo] = useState<PendingPromo>(null);
  const [opponentReply, setOpponentReply] = useState<string | null>(null);
  const [settings] = useState(loadSettings);

  const loadExercises = (c: string) => {
    api
      .exercices(c || undefined)
      .then((ex) => {
        setExercises(ex);
        setIdx(0);
        setProposed(null);
        setRevealed(false);
        setBoardFen(null);
        setSelected(null);
        setPendingPromo(null);
        setOpponentReply(null);
      })
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => {
    api
      .profile()
      .then(setProfile)
      .catch(() => {});
    loadExercises(searchParams.get("concept") ?? "");
  }, []);

  const exercise = exercises[idx] ?? null;

  const guessSan = useMemo(() => {
    if (!proposed || !exercise) return null;
    try {
      const b = new Chess(exercise.fen_before);
      const mv = b.move({
        from: proposed.slice(0, 2) as Square,
        to: proposed.slice(2, 4) as Square,
        promotion: proposed.length >= 5 ? (proposed[4] as Promo) : undefined,
      });
      return mv ? mv.san : null;
    } catch {
      return null;
    }
  }, [proposed, exercise]);

  if (err) return <div className="card">Erreur : {err}</div>;

  const playMove = (from: Square, to: Square, promo?: Promo) => {
    if (revealed || !exercise) return;
    const res = tryPlay(exercise.fen_before, from, to, promo);
    if (!res) return;
    setProposed(res.uci);
    setBoardFen(res.fen);
    const ok = res.uci === exercise.best_move_uci;
    setScore((s) => ({ ...s, total: s.total + 1, correct: s.correct + (ok ? 1 : 0) }));
    setRevealed(true);
    setSelected(null);
    setOpponentReply(null);
    api
      .recordEtude({
        username: "thegentleman31",
        game_id: exercise.game_id,
        ply: exercise.ply,
        fen: exercise.fen_before,
        san: exercise.san,
        best_move_uci: exercise.best_move_uci,
        best_move_san: exercise.best_move_san,
        concept: exercise.concept ?? undefined,
        attempt: res.uci,
        correct: ok,
      })
      .catch(() => {});
    if (exercise.ply !== null && exercise.ply !== undefined) {
      api
        .game(exercise.game_id)
        .then((g) => {
          const next = g.plies.find((p) => p.ply === (exercise.ply as number) + 1);
          if (next?.san) setOpponentReply(next.san);
        })
        .catch(() => {});
    }
  };

  const onSquareClick = (square: Square) => {
    if (revealed || !exercise || !settings.clickToMove || pendingPromo) return;
    const stm = sideToMove(exercise.fen_before);
    const piece = pieceAt(exercise.fen_before, square);
    if (!selected) {
      if (piece && piece.color === stm) setSelected(square);
      return;
    }
    if (square === selected) {
      setSelected(null);
      return;
    }
    if (piece && piece.color === stm) {
      setSelected(square);
      return;
    }
    const targets = legalMoveTargets(exercise.fen_before, selected);
    if (!targets.some((t) => t.to === square)) {
      setSelected(null);
      return;
    }
    setSelected(null);
    const isPawnPromo =
      pieceAt(exercise.fen_before, selected)?.type === "p" && (square[1] === "1" || square[1] === "8");
    if (isPawnPromo) {
      setPendingPromo({ from: selected, to: square });
    } else {
      playMove(selected, square);
    }
  };

  const onDrop = (source: string, target: string, piece?: string) => {
    if (revealed || !exercise || pendingPromo) return false;
    const from = source as Square;
    const to = target as Square;
    const moving = pieceAt(exercise.fen_before, from);
    if (!moving) return false;
    let promotion: Promo | undefined;
    if (moving.type === "p" && (to[1] === "1" || to[1] === "8")) {
      promotion = ((piece?.[1] ?? "q").toLowerCase() as Promo) || "q";
    }
    const res = tryPlay(exercise.fen_before, from, to, promotion);
    if (!res) return false;
    playMove(from, to, promotion);
    return true;
  };

  const next = () => {
    setIdx((i) => (i + 1 >= exercises.length ? 0 : i + 1));
    setProposed(null);
    setRevealed(false);
    setBoardFen(null);
    setSelected(null);
    setPendingPromo(null);
    setOpponentReply(null);
  };

  const restart = () => setScore({ correct: 0, total: 0 });

  const conceptKeys = (profile?.concepts_missing || []).map((c) => c.key);
  const options = concept ? [concept] : conceptKeys;
  const isCorrect = revealed && proposed === exercise?.best_move_uci;
  const colorLabel = exercise?.color === "w" ? "les Blancs" : "les Noirs";

  const arrows: Arrow[] = [];
  if (revealed && exercise?.best_move_uci) {
    arrows.push([
      exercise.best_move_uci.slice(0, 2) as Arrow[0],
      exercise.best_move_uci.slice(2, 4) as Arrow[1],
      "#2f7cd6",
    ]);
  }

  let squareStyles: CustomSquareStyles = {};
  if (settings.clickToMove && settings.showLegalMoves && !revealed && selected && exercise) {
    squareStyles = legalSquareStyles(legalMoveTargets(exercise.fen_before, selected), selected);
  }

  const stmLabel = exercise ? (sideToMove(exercise.fen_before) === "w" ? "Blancs" : "Noirs") : "";

  return (
    <div className="practice">
      <div className="card">
        <div className="practice-head">
          <div>
            <h2>Entraînement</h2>
            <p className="muted">
              Tes pires bévues, rejouées en positions d'exercice. Trouve le coup du moteur
              {settings.clickToMove
                ? " : clique une pièce, puis sa case d'arrivée."
                : " : déplace une pièce sur l'échiquier."}
            </p>
          </div>
          <select
            value={concept}
            onChange={(e) => {
              setConcept(e.target.value);
              loadExercises(e.target.value);
            }}
          >
            <option value="">Tous les concepts</option>
            {CONCEPT_LIST.filter((k) => conceptKeys.includes(k)).map((k) => (
              <option key={k} value={k}>
                {CONCEPT_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="practice-stats">
          <span>
            <b>{score.correct}</b> / {score.total} trouvés
          </span>
          <button onClick={restart}>Réinitialiser le score</button>
        </div>
      </div>

      <div className="board-layout">
        <div className="board card">
          {exercise ? (
            <div className="board-wrap">
              <Chessboard
                position={boardFen ?? exercise.fen_before}
                boardOrientation={
                  (exercise.color ?? sideToMove(exercise.fen_before)) === "b" ? "black" : "white"
                }
                arePiecesDraggable={!revealed}
                onPieceDrop={onDrop}
                onSquareClick={onSquareClick}
                customSquareStyles={squareStyles}
                customArrows={arrows}
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
                          playMove(from, to, p);
                        }}
                      >
                        {p === "q" ? "♕" : p === "r" ? "♖" : p === "n" ? "♘" : "♗"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="muted">Aucune bévue disponible pour ce concept.</p>
          )}
          <div className="board-nav">
            <span>
              {exercise
                ? `Exercice ${idx + 1}/${exercises.length} · ${CONCEPT_LABEL[exercise.concept ?? ""] ?? "général"}`
                : "—"}
            </span>
            <button onClick={next} disabled={exercises.length === 0}>
              Suivant ▶
            </button>
          </div>
        </div>

        <div className="side card">
          {!exercise ? (
            <p className="muted">Aucun exercice à afficher.</p>
          ) : (
            <>
              <div className="exercise-context">
                <div className="chips">
                  <span className="chip">Tu jouais {colorLabel}</span>
                  {exercise.concept && (
                    <span className="chip">{CONCEPT_LABEL[exercise.concept] ?? exercise.concept}</span>
                  )}
                  {exercise.phase && <span className="chip">{exercise.phase}</span>}
                </div>
                <p className="muted">
                  Coup <b>{exercise.move_number}</b> · {exercise.white} vs {exercise.black} ·{" "}
                  {exercise.result}
                  {exercise.opening_name ? ` · ${exercise.opening_name}` : ""}
                  {exercise.end_time ? ` · ${formatDate(exercise.end_time)}` : ""}
                </p>
              </div>

              {!revealed ? (
                <>
                  <h3>Trouve le coup</h3>
                  <p className="muted">
                    {options.length > 1
                      ? `Focalise-toi sur : ${options.map((k) => CONCEPT_LABEL[k]).join(", ")}`
                      : `Focalise-toi sur : ${CONCEPT_LABEL[options[0]]}`}
                  </p>
                  <p className="muted">
                    Aux {stmLabel}. Clique une pièce puis sa case d'arrivée (ou glisse-la).
                  </p>
                </>
              ) : (
                <div className="quiz-result">
                  <p className={isCorrect ? "good" : "bad"}>
                    {isCorrect ? "Exact ! C'était le coup du moteur." : "Pas tout à fait…"}
                  </p>
                  <p>
                    Ton coup : <b>{guessSan ?? proposed}</b>
                  </p>
                  <p>
                    Solution : <b>{exercise.best_move_san}</b>
                  </p>
                  {opponentReply && (
                    <p>
                      Réplique adverse (dans la partie) : <b>{opponentReply}</b>
                    </p>
                  )}
                  <p className="muted">
                    Dans ta partie, tu avais joué <b>{exercise.san}</b> au coup {exercise.move_number}
                    {settings.evalDisplay === "cp" &&
                    exercise.cp_loss !== null &&
                    exercise.cp_loss !== undefined
                      ? ` — il perdait l'équivalent de ${(exercise.cp_loss / 100).toFixed(1)} pions`
                      : exercise.winprob_loss !== null && exercise.winprob_loss !== undefined
                        ? ` — il perdait ${exercise.winprob_loss} pts de probabilité`
                        : ""}
                    .
                  </p>
                  <Link to={`/games/${exercise.game_id}?ply=${exercise.ply}`} className="btn-link">
                    Voir dans la partie →
                  </Link>
                  <button onClick={next}>Exercice suivant ▶</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
