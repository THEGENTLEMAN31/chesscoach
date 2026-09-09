import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRightIcon, BoltIcon, RefreshIcon, ChartIcon } from "../components/icons";
import { Button, Card, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import {
  CLASS_COLOR,
  CLASS_LABEL,
  formatDate,
  TIME_CLASS_LABEL,
} from "../lib/constants";
import { useSession } from "../lib/session";
import type { ClassCount } from "../lib/types";

const CLASS_ORDER = ["best", "good", "inaccuracy", "mistake", "blunder"];

function ClassRow({ c }: { c: ClassCount }) {
  const total = c.games || 1;
  const winShare = (c.wins / total) * 100;
  const drawShare = (c.draws / total) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {TIME_CLASS_LABEL[c.time_class] ?? c.time_class}
        </span>
        <span className="text-xs text-muted tabular-nums">{c.games} parties</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className="bg-accent" style={{ width: `${winShare}%` }} />
        <div className="bg-muted/60" style={{ width: `${drawShare}%` }} />
      </div>
      <div className="flex gap-3 text-xs text-muted tabular-nums">
        <span>{c.wins} V</span>
        <span>{c.draws} N</span>
        <span>{c.losses} D</span>
        <span className="ml-auto text-ink">{c.accuracy ?? "—"} %</span>
        <span className="text-accent">{c.acpl ?? "—"} aCPL</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useSession();
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const syncQ = useQuery({
    queryKey: ["sync"],
    queryFn: api.syncStatus,
    refetchInterval: 4000,
  });
  const digestQ = useQuery({ queryKey: ["digest"], queryFn: api.digestLatest });
  const recentQ = useQuery({
    queryKey: ["recent-games"],
    queryFn: () => api.games({ status: "analyzed", limit: "5" }),
  });
  const formQ = useQuery({
    queryKey: ["form-games"],
    queryFn: () => api.games({ status: "analyzed", limit: "20" }),
  });

  const running = syncQ.data?.running ?? false;
  const lastRun = syncQ.data?.last;

  const startSync = async () => {
    await api.sync(3);
    await syncQ.refetch();
  };

  // Premier run : un compte neuf (aucune partie) déclenche automatiquement le
  // chargement de son historique chess.com, sans bouton manuel.
  const isEmpty = statsQ.data && statsQ.data.by_time_class.length === 0 && statsQ.data.move_classifications && Object.keys(statsQ.data.move_classifications).length === 0;
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (isEmpty && !running && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startSync();
    }
  }, [isEmpty, running]);

  const cls = statsQ.data?.move_classifications ?? {};
  const maxCls = Math.max(1, ...CLASS_ORDER.map((k) => cls[k] ?? 0));
  const digest = digestQ.data;
  const narrative = Array.isArray(digest?.narrative)
    ? digest?.narrative.join(" ")
    : digest?.narrative;

  const form = useMemo(() => {
    const games = (formQ.data?.items ?? []).slice(0, 10);
    if (games.length === 0) return null;
    let wins = 0,
      draws = 0,
      losses = 0;
    let streak = 0;
    const accs: number[] = [];
    for (const g of games) {
      const won =
        (g.player_color === "w" && g.result === "1-0") ||
        (g.player_color === "b" && g.result === "0-1");
      const lost =
        (g.player_color === "w" && g.result === "0-1") ||
        (g.player_color === "b" && g.result === "1-0");
      if (won) wins++;
      else if (lost) losses++;
      else draws++;
      if (streak === 0) {
        if (won) streak = 1;
        else if (lost) streak = -1;
      } else if ((streak > 0 && won) || (streak < 0 && lost)) {
        streak += streak > 0 ? 1 : -1;
      } else if (!(g.result === "1/2-1/2")) {
        break;
      }
      if (g.accuracy != null) accs.push(g.accuracy);
    }
    const avgAcc = accs.length ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length) : null;
    // Précision récente = dernière partie analysée, tendance vs moyenne des 3 avant elle.
    const recentAcc = accs[0] ?? null;
    const older = accs.slice(1, 4);
    const olderAcc = older.length ? older.reduce((a, b) => a + b, 0) / older.length : null;
    const accDelta =
      recentAcc != null && olderAcc != null ? Math.round(recentAcc - olderAcc) : null;
    return { games: games.length, wins, draws, losses, streak, avgAcc, recentAcc, accDelta };
  }, [formQ.data]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Bonjour, {user?.chesscom_username}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Ton état de jeu, en un coup d'œil.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="sm:col-span-2">
          <h2 className="text-sm font-medium text-muted">Cadences</h2>
          {statsQ.isLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Spinner className="h-5 w-5 text-muted" />
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-4">
              {statsQ.data?.by_time_class.map((c) => (
                <ClassRow key={c.time_class} c={c} />
              ))}
              {statsQ.data && statsQ.data.by_time_class.length === 0 ? (
                <p className="text-sm text-muted">
                  Aucune partie analysée. Lance une synchronisation.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card className="sm:col-span-2">
          <h2 className="text-sm font-medium text-muted">Typologie des coups</h2>
          <div className="mt-3 flex flex-col gap-3">
            {CLASS_ORDER.map((k) => {
              const n = cls[k] ?? 0;
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-muted">
                    {CLASS_LABEL[k]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(n / maxCls) * 100}%`,
                        backgroundColor: CLASS_COLOR[k],
                      }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">
                    {n}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="sm:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BoltIcon className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-medium text-muted">Synchronisation</h2>
            </div>
            <Button
              onClick={() => void startSync()}
              disabled={running}
              variant="ghost"
              className="px-3 py-1.5 text-xs"
            >
              <RefreshIcon className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              {running ? "En cours…" : "Synchroniser"}
            </Button>
          </div>
          {lastRun ? (
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Parties vues" value={lastRun.games_seen} className="text-sm [&>div.text-2xl]:text-lg" />
              <Stat label="Nouvelles" value={lastRun.games_new} className="text-sm [&>div.text-2xl]:text-lg" />
              <Stat label="Analysées" value={lastRun.games_analyzed} className="text-sm [&>div.text-2xl]:text-lg" />
            </div>
          ) : (
            <p className="text-sm text-muted">
              Aucune synchronisation passée. Lance ta première.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Stat label="aCPL global" value={statsQ.data?.totals.avg_cp_loss ?? "—"} className="text-sm [&>div.text-2xl]:text-lg" />
            <Stat label="Gain de perte (blunders)" value={statsQ.data?.totals.blunder_acpl ?? "—"} className="text-sm [&>div.text-2xl]:text-lg" />
          </div>
        </Card>

        <Card className="sm:col-span-2 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-medium text-muted">Ma forme</h2>
          </div>
          {form ? (
            <>
              <div className="flex items-center justify-between">
                <div className="flex gap-1 text-xs font-semibold tabular-nums">
                  <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    {form.wins} V
                  </span>
                  <span className="px-2 py-1 rounded bg-zinc-500/15 text-zinc-600 dark:text-zinc-400">
                    {form.draws} N
                  </span>
                  <span className="px-2 py-1 rounded bg-red-500/15 text-red-600 dark:text-red-400">
                    {form.losses} D
                  </span>
                </div>
              </div>
              {form.streak !== 0 ? (
                <p className="text-sm">
                  Série en cours :{" "}
                  <b className={form.streak > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                    {Math.abs(form.streak)} {form.streak > 0 ? "victoire" : "défaite"}
                    {Math.abs(form.streak) > 1 ? "s" : ""} d'affilée
                  </b>{" "}
                  sur les {form.games} dernières parties.
                </p>
              ) : (
                <p className="text-sm text-muted">Série interrompue par un résultat nul.</p>
              )}
              {form.recentAcc != null && (
                <Stat
                  label="Précision (dernière partie)"
                  value={`${form.recentAcc}%`}
                  className="text-sm [&>div.text-2xl]:text-lg"
                />
              )}
              {form.accDelta != null && form.accDelta !== 0 && (
                <p className="text-xs text-muted">
                  Tendance précision :{" "}
                  <b className={form.accDelta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                    {form.accDelta > 0 ? "+" : ""}
                    {form.accDelta} pts
                  </b>{" "}
                  vs la moyenne des 3 précédentes.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Analyse quelques parties pour voir ton niveau de forme.
            </p>
          )}
        </Card>

        {digest ? (
          <Card className="sm:col-span-2">
            <h2 className="text-sm font-medium text-muted">
              Digest {digest.period}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/90">
              {narrative ?? "Aucun récapitulatif pour l'instant."}
            </p>
          </Card>
        ) : null}

        <Card className="sm:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-muted">Mes dernières parties</h2>
            <Link
              to="/games"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              Tout voir
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </div>
          {recentQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-5 w-5 text-muted" />
            </div>
          ) : recentQ.data && recentQ.data.items.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1.5">
              {recentQ.data.items.map((g) => (
                <li key={g.id}>
                  <Link
                    to={`/games/${g.id}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line/50 px-3 py-2 transition-colors hover:border-accent/50"
                  >
                    <span className="min-w-0 truncate text-sm">
                      {g.white} <span className="text-muted">vs</span> {g.black}
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted tabular-nums">
                      <span>{TIME_CLASS_LABEL[g.time_class] ?? g.time_class}</span>
                      <span>{formatDate(g.end_time)}</span>
                      <span className="text-accent">
                        {g.accuracy !== null && g.accuracy !== undefined ? `${g.accuracy}%` : "—"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Aucune partie analysée. Lance une synchronisation ci-dessus.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}