import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { BoltIcon, RefreshIcon } from "../components/icons";
import { Button, Card, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import {
  CLASS_COLOR,
  CLASS_LABEL,
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
      </div>
    </div>
  );
}