import { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import type { Arrow, CustomSquareStyles } from "react-chessboard/dist/chessboard/types";
import { TouchBackend } from "react-dnd-touch-backend";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { Square } from "chess.js";
import {
  legalMoveTargets,
  legalSquareStyles,
  type LegalTarget,
  type Promo,
} from "../lib/game/board";

const isTouchDevice =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export interface BoardProps {
  fen: string;
  orientation?: "white" | "black";
  draggable?: boolean;
  selected?: Square | null;
  targets?: LegalTarget[];
  arrows?: Arrow[];
  squareStyles?: CustomSquareStyles;
  onSquareClick?: (square: Square) => void;
  onPieceDrop?: (source: string, target: string, piece?: string) => boolean;
  pendingPromo?: { from: Square; to: Square } | null;
  onPromo?: (piece: Promo) => void;
  className?: string;
}

export function Board({
  fen,
  orientation = "white",
  draggable = true,
  selected,
  targets,
  arrows,
  squareStyles,
  onSquareClick,
  onPieceDrop,
  pendingPromo,
  onPromo,
  className = "",
}: BoardProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hints =
    selected && targets === undefined
      ? legalSquareStyles(legalMoveTargets(fen, selected), selected)
      : targets !== undefined
        ? legalSquareStyles(targets, selected)
        : {};

  const styles: CustomSquareStyles = { ...hints, ...squareStyles };

  return (
    <div ref={wrapRef} className={`relative w-full ${className}`}>
      {width >= 40 && (
        <Chessboard
          position={fen}
          boardWidth={width}
          boardOrientation={orientation}
          arePiecesDraggable={draggable}
          onPieceDrop={onPieceDrop}
          onSquareClick={onSquareClick}
          customArrows={arrows}
          customSquareStyles={styles}
          customLightSquareStyle={{ backgroundColor: "#ecece8" }}
          customDarkSquareStyle={{ backgroundColor: "#c9c6bf" }}
          customDndBackend={isTouchDevice ? TouchBackend : HTML5Backend}
          customDndBackendOptions={isTouchDevice ? { enableMouseEvents: true } : undefined}
        />
      )}
      {pendingPromo && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/60 backdrop-blur-sm">
          <span className="text-sm font-medium text-ink">Choisis la pièce de promotion</span>
          <div className="flex gap-2">
            {(["q", "r", "n", "b"] as Promo[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  if (onPromo) onPromo(p);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface-2 text-2xl text-ink transition-colors hover:bg-surface-3"
                aria-label={`Promotion ${p}`}
              >
                {p === "q" ? "♕" : p === "r" ? "♖" : p === "n" ? "♘" : "♗"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}