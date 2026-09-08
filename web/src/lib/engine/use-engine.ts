import { useCallback, useEffect, useRef, useState } from "react";
import { EngineWorker } from "@/lib/engine/engine";

let shared: EngineWorker | null = null;
let sharedRefs = 0;

export interface EngineState {
  ready: boolean;
  loading: boolean;
  failed: boolean;
}

function getShared(): EngineWorker {
  if (!shared) shared = new EngineWorker(1, 16);
  return shared;
}

/**
 * Accès partagé au moteur WASM (1 worker dédié).
 * Le worker est créé à la première demande (lazy) et fermé quand plus personne ne l'utilise.
 */
export function useEngine(): {
  engine: EngineWorker | null;
  state: EngineState;
} {
  const [state, setState] = useState<EngineState>({
    ready: false,
    loading: true,
    failed: false,
  });
  const engineRef = useRef<EngineWorker | null>(null);

  useEffect(() => {
    if (sharedRefs === 0) shared = null;
    let cancelled = false;
    const engine = getShared();
    engineRef.current = engine;
    sharedRefs += 1;
    engine.ready
      .then(() => {
        if (!cancelled) setState({ ready: true, loading: false, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ ready: false, loading: false, failed: true });
      });

    return () => {
      cancelled = true;
      sharedRefs -= 1;
      engineRef.current = null;
      if (sharedRefs <= 0 && shared) {
        void shared.dispose();
        shared = null;
      }
    };
  }, []);

  const getEngine = useCallback((): EngineWorker | null => engineRef.current, []);

  return { engine: getEngine(), state };
}

/** Lance un calcul bestmove ponctuel (retourne la PV à la profondeur max atteinte). */
export function useAnalyse() {
  const { engine, state } = useEngine();
  return {
    engine,
    state,
    analyse: useCallback(
      async (fen: string, opts: { movetime?: number; depth?: number } = { movetime: 700 }) => {
        if (!engine) return null;
        return engine.quickEval(fen, opts);
      },
      [engine],
    ),
    check: useCallback(
      async (fen: string, uciMove: string) => {
        if (!engine) return null;
        return engine.checkSolution(fen, uciMove);
      },
      [engine],
    ),
  };
}