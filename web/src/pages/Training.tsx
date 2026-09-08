import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Arrow } from "react-chessboard/dist/chessboard/types";
import { Chess, type Square } from "chess.js";
import { Board } from "../components/Board";
import { Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { CONCEPT_LABEL, CONCEPT_LIST, formatDate } from "../lib/constants";
import {
  legalMoveTargets,
  pieceAt,
  sideToMove,
  tryPlay,
  type Promo,
} from "../lib/game/board";
import type { Settings } from "../lib/game/settings";
import { loadSettings } from "../lib/game/settings";
import type { PlayerProfile } from "../lib/profile-types";
import { useSession } from "../lib/session";
import type { Exercise } from "../lib/types";
import { ChevronRightIcon } from "../components/icons";

type PendingPromo = { from: Square; to: Square } | null;

export default function Training() {
  const [searchParams] = useSearchParams();
  const { user } = useSession();
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
  const [settings] = useState<Settings>(loadSettings);

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
      .profile("global")
      .then((p) => setProfile(p as unknown as PlayerProfile))
      .catch(() => {});
    loadExercises(searchParams.get("concept") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (err) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Entraînement</h1>
        <Card>
          <p className="text-sm text-muted">Erreur : {err}</p>
        </Card>
      </div>
    );
  }

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
        username: user?.chesscom_username ?? "",
        time_class: "global",
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

  const stmLabel = exercise ? (sideToMove(exercise.fen_before) === "w" ? "Blancs" : "Noirs") : "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Entraînement</h1>
          <p className="mt-0.5 max-w-xl text-sm text-muted">
            Tes pires bévues, rejouées en positions d'exercice. Trouve le coup du moteur
            {settings.clickToMove
              ? " : clique une pièce, puis sa case d'arrivée."
              : " : déplace une pièce sur l'échiquier."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setConcept("");
              loadExercises("");
            }}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              concept === "" ? "border-accent bg-accent text-accent-ink" : "border-line text-muted hover:border-surface-3 hover:text-ink"
            }`}
          >
            Tous
          </button>
          {CONCEPT_LIST.filter((k) => conceptKeys.includes(k)).map((k) => (
            <button
              key={k}
              onClick={() => {
                setConcept(k);
                loadExercises(k);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                concept === k
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line text-muted hover:border-surface-3 hover:text-ink"
              }`}
            >
              {CONCEPT_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          <b className="text-ink tabular-nums">{score.correct}</b> /{" "}
          <b className="text-ink tabular-nums">{score.total}</b> coups du moteur trouvés
        </span>
        <button
          onClick={restart}
          className="text-xs font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Réinitialiser le score
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          {exercise ? (
            <Board
              fen={boardFen ?? exercise.fen_before}
              orientation={
                (exercise.color ?? sideToMove(exercise.fen_before)) === "b" ? "black" : "white"
              }
              draggable={!revealed}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              arrows={arrows}
              selected={selected}
              pendingPromo={pendingPromo}
              onPromo={(p) => {
                if (!pendingPromo) return;
                const { from, to } = pendingPromo;
                setPendingPromo(null);
                playMove(from, to, p);
              }}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted">
              Aucune bévue disponible pour ce concept.
            </p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-sm text-muted">
              {exercise
                ? `Exercice ${idx + 1}/${exercises.length} · ${
                    exercise.concept ? (CONCEPT_LABEL[exercise.concept] ?? exercise.concept) : "général"
                  }`
                : "—"}
            </span>
            <Button onClick={next} disabled={exercises.length === 0} className="px-3 py-1.5 text-xs">
              Suivant
            </Button>
          </div>
        </Card>

        <Card>
          {!exercise ? (
            <p className="text-sm text-muted">Aucun exercice à afficher.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-muted">
                  Tu jouais {colorLabel}
                </span>
                {exercise.concept && (
                  <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-accent">
                    {CONCEPT_LABEL[exercise.concept] ?? exercise.concept}
                  </span>
                )}
                {exercise.phase && (
                  <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-muted">
                    {exercise.phase}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Coup <b className="text-ink">{exercise.move_number}</b> ·{" "}
                {exercise.white} vs {exercise.black} · {exercise.result}
                {exercise.opening_name ? ` · ${exercise.opening_name}` : ""}
                {exercise.end_time ? ` · ${formatDate(exercise.end_time)}` : ""}
              </p>

              {!revealed ? (
                <>
                  <h2 className="text-sm font-semibold tracking-tight">Trouve le coup</h2>
                  <p className="text-sm text-muted">
                    {options.length > 1
                      ? `Focalise-toi sur : ${options.map((k) => CONCEPT_LABEL[k]).join(", ")}`
                      : `Focalise-toi sur : ${CONCEPT_LABEL[options[0]] ?? "tes concepts"}`}
                  </p>
                  <p className="text-sm text-muted">
                    Aux {stmLabel}. Clique une pièce puis sa case d'arrivée (ou glisse-la).
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-1.5 text-sm">
                  <p className={isCorrect ? "font-medium text-[#3fb562]" : "font-medium text-[#d9534f]"}>
                    {isCorrect ? "Exact ! C'était le coup du moteur." : "Pas tout à fait…"}
                  </p>
                  <p>
                    Ton coup : <b className="text-ink">{guessSan ?? proposed}</b>
                  </p>
                  <p>
                    Solution : <b className="text-ink">{exercise.best_move_san}</b>
                  </p>
                  {opponentReply && (
                    <p>
                      Réplique adverse (dans la partie) : <b className="text-ink">{opponentReply}</b>
                    </p>
                  )}
                  <p className="text-xs text-muted">
                    Dans ta partie, tu avais joué <b className="text-ink">{exercise.san}</b> au coup{" "}
                    {exercise.move_number}
                    {settings.evalDisplay === "cp" && exercise.cp_loss !== null && exercise.cp_loss !== undefined
                      ? ` — il perdait l'équivalent de ${(exercise.cp_loss / 100).toFixed(1)} pions`
                      : exercise.winprob_loss !== null && exercise.winprob_loss !== undefined
                        ? ` — il perdait ${exercise.winprob_loss} pts de probabilité`
                        : ""}
                    .
                  </p>
                  <Link
                    to={`/games/${exercise.game_id}?ply=${exercise.ply}`}
                    className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    Voir dans la partie
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                  <Button onClick={next} className="mt-2 w-max px-3 py-1.5 text-xs">
                    Exercice suivant
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}