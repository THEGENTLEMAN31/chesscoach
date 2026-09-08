import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { useAnalyse } from "../lib/engine/use-engine";
import {
  analysePlies,
  buildMeta,
  buildMetaFromChesscom,
  extractMoves,
  fetchChesscomGame,
  gameIdFromUrl,
  ImportError,
  parseChesscomMoves,
  parseGameHeaders,
  parsePgnMoves,
  persistImportedGame,
  toPlyRows,
  toServerPayload,
} from "../lib/local/import";
import { getLocalMeta, resetLocalDb } from "../lib/local/store";
import {
  bumpQueue,
  listLocalGames,
  markSynced,
  removeLocalGame,
  type LocalGameMeta,
} from "../lib/local/repo";
import { useSession } from "../lib/session";

type Mode = "" | "pgn" | "url";

export default function ImportPage() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { state: engineState, engine } = useAnalyse();
  const [mode, setMode] = useState<Mode>("");
  const [pgn, setPgn] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [localGames, setLocalGames] = useState<LocalGameMeta[]>([]);
  const [meta, setMeta] = useState<{ games: number; queue: number }>({ games: 0, queue: 0 });
  const [syncing, setSyncing] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState<boolean>(false);

  const refreshLocal = useCallback(async () => {
    const [games, m] = await Promise.all([listLocalGames(), getLocalMeta()]);
    setLocalGames(games);
    setMeta(m);
  }, []);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const runImport = async (source: "pgn" | "url") => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setCancelled(false);
    setProgress({ done: 0, total: 0 });
    try {
      let metaOut;
      let plies;
      if (source === "pgn") {
        if (!pgn.trim()) throw new ImportError("Colle un PGN d'abord.");
        const headers = parseGameHeaders(pgn);
        const { sans } = extractMoves(pgn);
        if (!sans.length) throw new ImportError("Aucun coup trouvé dans ce PGN.");
        metaOut = buildMeta({
          source: "pgn",
          headers,
          username: user?.chesscom_username ?? "",
          pgn,
        });
        plies = parsePgnMoves(metaOut.fenStart, sans);
      } else {
        const id = gameIdFromUrl(url);
        if (!id) throw new ImportError("URL invalide. Format : chess.com/game/live/{id}");
        if (!user?.chesscom_username) throw new ImportError("Pseudo chess.com manquant dans ton profil.");
        setProgress({ done: 0, total: 1 });
        const { json, found } = await fetchChesscomGame(id, user.chesscom_username);
        if (!found) {
          throw new ImportError("Partie introuvable (elle n'est peut-être pas publique ou pas récente).");
        }
        metaOut = buildMetaFromChesscom(json, user.chesscom_username);
        plies = parseChesscomMoves(metaOut.fenStart, json.moves ?? []);
        if (!plies.length) throw new ImportError("Partie vide.");
      }

      if (!engine) throw new ImportError("Moteur local non prêt.");
      const { analysed, accuracy, acpl, classifications } = await analysePlies(
        plies,
        metaOut.playerColor,
        engine,
        { movetime: 400, depth: 12 },
        setProgress,
        () => cancelled,
      );
      if (cancelled) throw new ImportError("analyse annulée");

      const rows = toPlyRows(analysed, metaOut.playerColor);
      const localId = await persistImportedGame(metaOut, rows, accuracy, acpl, classifications, true);

      // sync best effort : si le serveur répond, on passe au review serveur.
      try {
        const g = await api.acceptImport(toServerPayload(metaOut, rows));
        await markSynced(localId, g.id);
        navigate(`/games/${g.id}`);
        return;
      } catch (syncErr) {
        const msg = String(syncErr);
        await bumpQueue(localId, msg).catch(() => {});
        navigate(`/local/${localId}`);
        return;
      }
    } catch (e) {
      setError(e instanceof ImportError ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress({ done: 0, total: 0 });
      void refreshLocal();
    }
  };

  const retrySync = async (g: LocalGameMeta) => {
    if (!g.id || syncing) return;
    setSyncing(g.id);
    try {
      const { getLocalGameDetail } = await import("../lib/local/repo");
      const game = await getLocalGameDetail(g.id);
      if (!game) return;
      const payload = {
        white: game.white,
        black: game.black,
        white_elo: game.white_elo,
        black_elo: game.black_elo,
        result: game.result,
        player_color: game.player_color,
        time_class: game.time_class,
        time_control: game.time_control,
        end_time: game.end_time,
        eco: game.eco,
        opening_name: game.opening_name,
        termination: game.termination,
        fen_start: g.fen_start ?? undefined,
        pgn: g.pgn ?? undefined,
        chesscom_id: g.chesscom_id,
        rules: "chess",
        plies: game.plies.map((p) => ({
          ply: p.ply,
          move_number: p.ply % 2 === 0 ? p.ply / 2 + 1 : (p.ply + 1) / 2,
          color: p.ply % 2 === 0 ? "w" : "b",
          san: p.san,
          uci: p.uci,
          fen_before: p.fen_before,
          fen_after: p.fen_after,
          eval_before_cp: p.eval_before?.cp ?? null,
          mate_before: p.eval_before?.mate ?? null,
          eval_after_cp: p.eval_after?.cp ?? null,
          mate_after: p.eval_after?.mate ?? null,
          best_move_uci: p.best_move,
          best_move_san: p.best_move_san,
          cp_loss: p.cp_loss,
          classification: p.classification,
          clk: p.clk,
          time_taken: p.time_taken,
          phase: p.phase,
          is_book: p.is_book ? 1 : 0,
          is_player: p.is_player ? 1 : 0,
          concept: p.concept,
        })),
      };
      const res = await api.acceptImport(payload);
      await markSynced(g.id, res.id);
      navigate(`/games/${res.id}`);
    } catch (e) {
      await bumpQueue(g.id, String(e)).catch(() => {});
      setError(`Sync échouée : ${String(e)}`);
    } finally {
      setSyncing(null);
      void refreshLocal();
    }
  };

  const sel = (m: Mode) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
      mode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Importer une partie</h1>
        <p className="mt-1 text-sm text-muted">
          Analyse instantanée sur ton appareil (moteur WASM) puis sync vers le
          serveur quand la connexion revient. Fonctionne aussi hors-ligne.
        </p>
      </div>

      <Card>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1 w-max">
          {(["pgn", "url"] as Mode[]).filter(Boolean).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={sel(m)}>
              {m === "pgn" ? "Coller un PGN" : "Lien chess.com"}
            </button>
          ))}
        </div>

        {mode === "pgn" && (
          <div className="mt-3 flex flex-col gap-3">
            <textarea
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              placeholder={'[Event "Rated Rapid game"]\n[White "PlayerA"]\n[Black "PlayerB"]\n\n1. e4 e5 2. Nf3 Nc6 *'}
              className="min-h-40 w-full resize-y rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
              spellCheck={false}
            />
          </div>
        )}

        {mode === "url" && (
          <div className="mt-3 flex flex-col gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.chess.com/game/live/123456789"
              className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {user?.chesscom_username && (
              <p className="text-xs text-muted">
                Recherche dans les archives de <b className="text-ink">{user.chesscom_username}</b> (12 derniers mois).
              </p>
            )}
          </div>
        )}

        {mode && (
          <>
            <Button
              onClick={() => runImport(mode as "pgn" | "url")}
              disabled={busy || engineState.loading}
              className="mt-3"
            >
              {busy ? "Analyse en cours…" : engineState.loading ? "Chargement du moteur…" : "Importer et analyser"}
            </Button>
            {engineState.failed && (
              <p className="mt-2 text-xs text-[#d9534f]">
                Moteur local indisponible — réessaie plus tard.
              </p>
            )}
          </>
        )}

        {busy && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span className="inline-flex items-center gap-2">
                <Spinner className="h-3.5 w-3.5" /> Analyse du moteur local…
              </span>
              <button
                onClick={() => setCancelled(true)}
                className="rounded-md border border-line px-2 py-0.5 text-xs text-ink hover:bg-surface-3"
              >
                Annuler
              </button>
            </div>
            {progress.total > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                />
              </div>
            )}
            <p className="mt-1 text-xs tabular-nums text-muted">
              {progress.done} / {progress.total} positions
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-[#d9534f]">{error}</p>}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Parties locales</h2>
          <span className="text-xs text-muted">
            {localGames.length} partie{localGames.length > 1 ? "s" : ""} · {meta.queue} en attente de sync
          </span>
        </div>
        {localGames.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Aucune partie importée sur cet appareil.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {localGames.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">
                    {g.white} vs {g.black}
                    <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-xs font-semibold tabular-nums">
                      {g.result}
                    </span>
                    {g.time_class && (
                      <span className="ml-1 text-xs text-muted">{g.time_class}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {g.accuracy !== null ? `précision ${g.accuracy}% · ` : ""}
                    {g.status === "synced"
                      ? "synchronisée"
                      : "en attente de sync"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {g.status !== "synced" && (
                    <button
                      onClick={() => retrySync(g)}
                      disabled={syncing === g.id}
                      className="rounded-md border border-line px-2 py-1 text-xs text-accent hover:bg-surface-3 disabled:opacity-50"
                    >
                      {syncing === g.id ? "…" : "Sync"}
                    </button>
                  )}
                  <button
                    onClick={() => navigate(`/local/${g.id}`)}
                    className="rounded-md border border-line px-2 py-1 text-xs text-ink hover:bg-surface-3"
                  >
                    Ouvrir
                  </button>
                  <button
                    onClick={async () => {
                      await removeLocalGame(g.id);
                      void refreshLocal();
                    }}
                    className="rounded-md border border-line px-2 py-1 text-xs text-muted hover:bg-surface-3"
                    aria-label="Supprimer"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
            <li className="flex justify-end">
              <button
                onClick={async () => {
                  if (confirm("Supprimer toutes les parties locales ?")) {
                    await resetLocalDb();
                    void refreshLocal();
                  }
                }}
                className="text-xs text-muted hover:text-ink"
              >
                Tout supprimer
              </button>
            </li>
          </ul>
        )}
      </Card>
    </div>
  );
}