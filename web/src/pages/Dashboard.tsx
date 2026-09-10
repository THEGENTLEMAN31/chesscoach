import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRightIcon, BoltIcon, RefreshIcon, ChartIcon, TargetIcon, ListIcon } from "../components/icons";
import { Button, Card, Spinner } from "../components/ui";
import EloChart from "../components/EloChart";
import { api } from "../lib/api";
import {
  CONCEPT_LABEL,
  formatDate,
  TIME_CLASS_LABEL,
} from "../lib/constants";
import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";
import type { ClassCount } from "../lib/types";
import type { PlayerProfile } from "../lib/profile-types";

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
  const { push } = useToast();
  const navigate = useNavigate();
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: api.stats });
  const syncQ = useQuery({
    queryKey: ["sync"],
    queryFn: api.syncStatus,
    refetchInterval: 4000,
  });
  const recentQ = useQuery({
    queryKey: ["recent-games"],
    queryFn: () => api.games({ status: "analyzed", limit: "5" }),
  });
  const formQ = useQuery({
    queryKey: ["form-games"],
    queryFn: () => api.games({ status: "analyzed", limit: "20" }),
  });
  const nextExQ = useQuery({
    queryKey: ["next-exercise"],
    queryFn: () => api.exercices({ nombre: "1" }),
  });
  const nextExercise = nextExQ.data?.[0] ?? null;

  const profileQ = useQuery({
    queryKey: ["profile-all"],
    queryFn: () => api.profileAll(),
  });
  const objectivesQ = useQuery({
    queryKey: ["objectives"],
    queryFn: () => api.objectives(),
  });

  const profile = useMemo(() => {
    const raw = profileQ.data?.profiles?.global;
    return (raw as unknown as PlayerProfile) ?? null;
  }, [profileQ.data]);

  const running = syncQ.data?.running ?? false;
  const pending = syncQ.data?.pending_analysis ?? 0;
  const lastRun = syncQ.data?.last;

  const startSync = async () => {
    await api.sync(3);
    push("info", `${user?.chesscom_username ?? "Ton"} historique chess.com se charge…`);
    await syncQ.refetch();
  };

  const isEmpty = statsQ.data && statsQ.data.by_time_class.length === 0 && statsQ.data.move_classifications && Object.keys(statsQ.data.move_classifications).length === 0;
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (isEmpty && !running && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startSync();
    }
  }, [isEmpty, running]);

  const eloData = useMemo(() => {
    if (!profile) return null;
    const current = profile.rating.latest;
    const target = objectivesQ.data?.targets?.rapid ?? profile.objective?.target_elo ?? null;
    const trend = profile.progress?.elo_trend ?? null;
    const eloCurve = profile.progress?.elo_curve ?? [];
    const last30 = eloCurve.filter((p) => {
      const d = new Date(p.date).getTime();
      return d >= Date.now() - 30 * 24 * 3600_000;
    });
    return { current, target, trend, eloCurve: last30 };
  }, [profile, objectivesQ.data]);

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
        {isEmpty ? (
          <Card className="sm:col-span-4">
            <h2 className="text-base font-semibold tracking-tight">
              Bienvenue, {user?.chesscom_username}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              ChessCoach analyse tes parties et transforme tes vrais coups ratés en
              exercices personnels. Première étape : récupérer ton historique chess.com.
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full bg-accent transition-all ${
                  running ? "animate-pulse" : ""
                }`}
                style={{ width: running ? "100%" : "0%" }}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              {running
                ? `Analyse en cours — ${pending} position${pending > 1 ? "s" : ""} en attente. Reviens dans quelques minutes : les cartes ci-dessous se rempliront toutes seules.`
                : "Prêt à lancer ta première synchronisation automatique."}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                {
                  icon: ChartIcon,
                  title: "Profil pédagogique",
                  text: "Forces, faiblesses et tendances calculées sur toutes tes parties analysées.",
                  to: "/progression",
                },
                {
                  icon: TargetIcon,
                  title: "Exercices sur mesure",
                  text: "Tes bévues rejouées en positions d'exercice, classées par concept à travailler.",
                  to: "/training",
                },
                {
                  icon: ListIcon,
                  title: "Révision coup par coup",
                  text: "Relis chaque partie avec l'évaluation moteur et le coup que tu aurais dû jouer.",
                  to: "/games",
                },
              ].map((s) => (
                <Link
                  key={s.title}
                  to={s.to}
                  className="group flex flex-col gap-2 rounded-xl border border-line bg-surface-2/60 p-3 transition-colors hover:border-accent/50"
                >
                  <s.icon className="h-4.5 w-4.5 text-accent" />
                  <span className="text-sm font-medium text-ink">{s.title}</span>
                  <span className="text-xs leading-relaxed text-muted">{s.text}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                    Découvrir
                    <ChevronRightIcon className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        ) : (
          <>
            {/* ELO Header */}
{eloData && (
               <Card className="sm:col-span-4 p-4">
                 <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center gap-4">
                    {eloData.current != null && (
<div className="flex items-baseline gap-1.5">
                   <span className="text-xs text-muted">ÉLO (global)</span>
                   <span className="text-2xl font-bold tracking-tight text-ink tabular-nums">
                     {eloData.current}
                   </span>
                 </div>
                    )}
                    {eloData.target != null && eloData.current != null && (
<Link to="/profile" className="group flex items-baseline gap-1.5">
                         <span className="text-xs text-muted">Objectif rapide</span>
                         <span className="text-lg font-semibold text-accent tabular-nums group-hover:underline">
                           {eloData.target}
                         </span>
                         {profile?.objective?.progression_pct != null && (
                           <span className="text-xs text-muted">
                             ({Math.round(profile.objective.progression_pct)}% fait)
                           </span>
                         )}
                       </Link>
                    )}
                    {eloData.trend != null && (
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted">Tendance</span>
                        <span className={eloData.trend >= 0 ? "text-eval-up" : "text-eval-down"}>
                          {eloData.trend >= 0 ? "↗" : "↘"} {eloData.trend >= 0 ? "+" : ""}
                          {Math.round(eloData.trend)} pts/mois
                        </span>
                      </div>
                    )}
                  </div>
                  {eloData.eloCurve.length > 1 && (
                    <div className="mt-1">
<EloChart
                         series={[{
                           label: "ELO",
                           color: "var(--color-accent, #6fa8dc)",
                           dates: eloData.eloCurve.map((p) => p.date),
                           elo: eloData.eloCurve.map((p) => p.elo),
                         }]}
                         height={260}
                         milestones={[1200, 1400, 1600, 1800, 2000]}
                       />
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Hero card: À travailler */}
            <Card className="sm:col-span-4 border-accent/30 bg-accent/5 p-5">
              <div className="flex items-center gap-2">
                <TargetIcon className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-medium text-muted">À travailler</h2>
              </div>
              {nextExQ.isLoading ? (
                <div className="flex h-16 items-center justify-center">
                  <Spinner className="h-5 w-5 text-muted" />
                </div>
              ) : nextExercise ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs text-accent font-medium">
                      {nextExercise.concept
                        ? CONCEPT_LABEL[nextExercise.concept] ?? nextExercise.concept
                        : "Position clé"}
                    </span>
                    {nextExercise.phase ? (
                      <span className="rounded-md border border-line bg-surface-3/60 px-2.5 py-1 text-xs text-muted">
                        {nextExercise.phase}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted">
                      du {nextExercise.end_time ? formatDate(nextExercise.end_time) : "—"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    Trouve le coup du moteur — tu avais joué{" "}
                    <b className="text-ink">{nextExercise.san}</b>
                    {nextExercise.winprob_loss != null
                      ? ` (−${nextExercise.winprob_loss} pts de probabilité)`
                      : ""}.
                  </p>
                  <div className="mt-3">
                    <Button
                      onClick={() => navigate("/training")}
                      className="px-3 py-1.5 text-xs"
                    >
                      Commencer l'entraînement
                      <ChevronRightIcon className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  Analyse quelques parties pour voir apparaître tes exercices personnels.
                </p>
              )}
            </Card>

            {/* Ma forme (compact) */}
            <Card className="sm:col-span-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ChartIcon className="h-4 w-4 text-accent" />
                <h2 className="text-sm font-medium text-muted">Ma forme</h2>
              </div>
              {form ? (
                <div className="flex flex-col gap-1.5 text-sm">
                  <div className="flex items-center gap-3 text-xs tabular-nums">
                    <span className="text-eval-up font-medium">{form.wins}V</span>
                    <span className="text-muted">{form.draws}N</span>
                    <span className="text-eval-down font-medium">{form.losses}D</span>
                    {form.streak !== 0 && (
                      <span className={form.streak > 0 ? "text-eval-up" : "text-eval-down"}>
                        · {Math.abs(form.streak)} {form.streak > 0 ? "victoire" : "défaite"}
                        {Math.abs(form.streak) > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {form.recentAcc != null && (
                    <div className="text-xs text-muted">
                      Précision : <b className="text-ink">{form.recentAcc}%</b>
                      {form.accDelta != null && form.accDelta !== 0 && (
                        <span className={form.accDelta > 0 ? "text-eval-up" : "text-eval-down"}>
                          {" "}
                          {form.accDelta > 0 ? "+" : ""}{form.accDelta} pts
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">
                  Analyse quelques parties pour voir ta forme.
                </p>
              )}
            </Card>

            {/* Cadences */}
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

            {/* Synchronisation (condensed) */}
            <Card className="sm:col-span-4 flex flex-col gap-3">
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
              {running ? (
                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                    <div className="h-full animate-pulse rounded-full bg-accent" style={{ width: `${Math.max(8, Math.min(100, 100 - pending * 2))}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    Analyse en cours — {pending} position{pending > 1 ? "s" : ""} en attente.
                  </p>
                </div>
              ) : lastRun ? (
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>Dernière sync : {lastRun.finished_at ? formatDate(Math.floor(new Date(lastRun.finished_at).getTime() / 1000)) : "en cours"}</span>
                  <span>·</span>
                  <span>{lastRun.games_analyzed} parties analysées</span>
                  {statsQ.data?.totals.avg_cp_loss != null && (
                    <>
                      <span>·</span>
                      <span>aCPL : <b className="text-ink">{statsQ.data.totals.avg_cp_loss}</b></span>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted">Aucune synchronisation passée.</p>
              )}
            </Card>

            {/* Mes dernières parties */}
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
                  Aucune partie analysée. Lance une synchronisation.
                </p>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}