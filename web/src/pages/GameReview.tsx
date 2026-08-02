import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Chessboard } from "react-chessboard";
import type { Arrow, CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import type { GameDetail } from "../types";
import { api, timeClassLabel, formatDate } from "../api";
import { CLASS_LABEL, CLASS_COLOR } from "../constants";
import EvalCurve from "../components/EvalCurve";
import MoveList from "../components/MoveList";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export default function GameReview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);

  useEffect(() => {
    setGame(null);
    setSelected(-1);
    api
      .game(id!)
      .then(setGame)
      .catch((e) => setError(String(e)));
  }, [id]);

  const ply = useMemo(() => {
    if (!game || selected < 0) return null;
    return game.plies.find((p) => p.ply === selected) ?? null;
  }, [game, selected]);

  const position = useMemo(() => {
    if (!game) return START_FEN;
    if (!ply) return game.plies[0]?.fen_before ?? START_FEN;
    return ply.fen_after ?? ply.fen_before;
  }, [game, ply]);

  if (error) return <div className="card">Erreur : {error}</div>;
  if (!game) return <div className="card">Chargement…</div>;

  const playedFrom = ply?.uci?.slice(0, 2);
  const playedTo = ply?.uci?.slice(2, 4);
  const bestFrom = ply?.best_move?.slice(0, 2);
  const bestTo = ply?.best_move?.slice(2, 4);

  const squareStyles: CustomSquareStyles = {};
  if (playedFrom) squareStyles[playedFrom as keyof CustomSquareStyles] = { background: "rgba(255,255,0,0.45)" };
  if (playedTo) squareStyles[playedTo as keyof CustomSquareStyles] = { background: "rgba(255,255,0,0.45)" };

  const arrows: Arrow[] = [];
  if (bestFrom && bestTo) {
    arrows.push([bestFrom as Arrow[0], bestTo as Arrow[1], "#38bdf8"]);
  }
  if (playedFrom && playedTo && ply?.classification && ply.classification !== "book") {
    const c = CLASS_COLOR[ply.classification] ?? "#94a3b8";
    arrows.push([playedFrom as Arrow[0], playedTo as Arrow[1], c]);
  }

  const moveForward = () => {
    const next = selected + 2;
    if (next < game.plies.length) setSelected(next);
    else setSelected(game.plies.length - 1);
  };
  const moveBack = () => {
    if (selected < 0) return;
    setSelected(selected - 2 >= -1 ? selected - 2 : -1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") moveForward();
      if (e.key === "ArrowLeft") moveBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="review">
      <div className="game-header card">
        <button className="back" onClick={() => navigate("/games")}>
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
          <span className="chip">Précision : <b>{game.accuracy ?? "—"}%</b></span>
          <span className="chip">ACPL : <b>{game.acpl ?? "—"}</b></span>
          {game.classifications &&
            Object.entries(game.classifications).map(([k, v]) => (
              <span key={k} className="chip" style={{ color: CLASS_COLOR[k] }}>
                {CLASS_LABEL[k] ?? k} : {v}
              </span>
            ))}
        </div>
      </div>

      <div className="board-layout">
        <div className="board card">
          <Chessboard
            position={position}
            boardOrientation={game.player_color === "b" ? "black" : "white"}
            arePiecesDraggable={false}
            onPieceDrop={() => false}
            customArrows={arrows}
            customSquareStyles={squareStyles}
          />
          <div className="board-nav">
            <button onClick={moveBack} disabled={selected < 0}>◀ Précédent</button>
            <span>
              {ply ? `coup ${ply.san} (${ply.ply + 1})` : "position initiale"}
            </span>
            <button onClick={moveForward} disabled={selected >= game.plies.length - 1}>
              Suivant ▶
            </button>
          </div>
        </div>

        <div className="side card">
          <EvalCurve game={game} selectedPly={selected} onSelect={setSelected} />
          {ply?.best_move_san && (
            <div className="best-move">
              Coup suggéré : <b>{ply.best_move_san}</b>
            </div>
          )}
          <MoveList
            plies={game.plies}
            selectedPly={selected}
            onSelect={setSelected}
          />
        </div>
      </div>
    </div>
  );
}
