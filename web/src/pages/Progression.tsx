import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import EloChart from "../components/EloChart";
import { Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { TIME_CLASS_LABEL } from "../lib/constants";
import type { GameOut } from "../lib/types";
import type { PlayerProfile } from "../lib/profile-types";
import { buildEloPoints } from "../lib/game/elo-series";

type Tab = "rapid" | "blitz" | "both";

const TABS: { key: Tab; label: string }[] = [
  { key: "rapid", label: "Rapide" },
  { key: "blitz", label: "Blitz" },
  { key: "both", label: "Comparer" },
];

const WINDOWS: { value: number; label: string }[] = [
  { value: 20, label: "20 parties" },
  { value: 100, label: "100 parties" },
  { value: 0, label: "Tout" },
];

export default function Progression() {
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile> | null>(null);
  const [games, setGames] = useState<Record<string, GameOut[]>>({});
  const [objectives, setObjectives] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<{ dates: string[]; elo: (number | null)[]; games: number[] } | null>(null);
  const [tab, setTab] = useState<Tab>("rapid");
  const [windowSize, setWindowSize] = useState(100);
  const [smooth, setSmooth] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.profileAll(),
      api.objectives(),
      api.profileHistory("global").catch(() => null),
      api.games({ time_class: "rapid", limit: "500" }).catch(() => ({ items: [] })),
      api.games({ time_class: "blitz", limit: "500" }).catch(() => ({ items: [] })),
    ])
      .then(([all, obj, hist, rapid, blitz]) => {
        if (cancelled) return;
        const p: Record<string, PlayerProfile> = {};
        for (const [k, v] of Object.entries(all.profiles)) p[k] = v as unknown as PlayerProfile;
        setProfiles(p);
        setObjectives((obj as unknown as { targets?: Record<string, number> })?.targets ?? {});
        setHistory((hist as unknown as typeof history) ?? null);
        setGames({ rapid: rapid.items, blitz: blitz.items });
      })
      .catch((e) => !cancelled && setErr(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const rapidPts = useMemo(() => buildEloPoints(games.rapid ?? [], windowSize), [games.rapid, windowSize]);
  const blitzPts = useMemo(() => buildEloPoints(games.blitz ?? [], windowSize), [games.blitz, windowSize]);

  const series = useMemo(() => {
    const mk = (id: "rapid" | "blitz", pts: ReturnType<typeof buildEloPoints>, color: string) => ({
      id,
      label: TIME_CLASS_LABEL[id] ?? id,
      color,
      points: pts,
    });
    if (tab === "rapid") return [mk("rapid", rapidPts, "var(--chart-1)")];
    if (tab === "blitz") return [mk("blitz", blitzPts, "var(--chart-2)")];
    return [mk("rapid", rapidPts, "var(--chart-1)"), mk("blitz", blitzPts, "var(--chart-2)")];
  }, [tab, rapidPts, blitzPts]);

  const headlinePts = tab === "blitz" ? blitzPts : rapidPts;
  const headlineClass = tab === "blitz" ? "blitz" : "rapid";
  const current = headlinePts.length ? headlinePts[headlinePts.length - 1].elo : null;
  const delta =
    headlinePts.length > 1 ? Math.round(headlinePts[headlinePts.length - 1].elo - headlinePts[0].elo) : null;
  const record = headlinePts.length ? Math.max(...headlinePts.map((p) => p.elo)) : null;
  const target = tab === "both" ? null : objectives[headlineClass] ?? null;

  const profile = profiles?.global ?? null;
  const tabCount = profiles?.[tab === "both" ? "global" : tab]?.games.n ?? null;

  const onSelectPoint = (p: { gameId: number }) => navigate(`/games/${p.gameId}`);

  if (err) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Progression</h1>
        <Card>
          <p className="text-sm text-muted">Erreur : {err}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Progression</h1>
        <p className="mt-0.5 text-sm text-muted">
          Ta trajectoire par partie, sans trous d'inactivité. Survole une partie pour le détail.
        </p>
      </div>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                tab === t.key ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.value}
              onClick={() => setWindowSize(w.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                windowSize === w.value ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSmooth((s) => !s)}
          aria-pressed={smooth}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            smooth ? "border-accent/40 text-accent" : "border-line text-muted hover:text-ink"
          }`}
        >
          {smooth ? "Lissé" : "Brut"}
        </button>

        {tabCount != null && (
          <span className="ml-auto text-xs text-muted tabular-nums">{tabCount} parties analysées</span>
        )}
      </div>

      {/* headline metrics */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs text-muted">{tab === "both" ? "Rapide" : TIME_CLASS_LABEL[headlineClass]}</span>
          <span className="text-2xl font-bold tracking-tight tabular-nums">{current ?? "—"}</span>
        </div>
        {delta != null && (
          <span className={`text-sm font-medium ${delta >= 0 ? "text-eval-up" : "text-eval-down"}`}>
            {delta >= 0 ? "↗ +" : "↘ "}
            {delta} sur {headlinePts.length} parties
          </span>
        )}
        {record != null && (
          <span className="text-xs text-muted">
            record <b className="text-ink tabular-nums">{record}</b>
          </span>
        )}
        {target != null && (
          <Link to="/profile" className="text-xs text-muted hover:text-ink">
            objectif <b className="text-accent tabular-nums">{target}</b>
          </Link>
        )}
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Courbe Elo</h2>
          <span className="text-[11px] text-subtle">
            {windowSize === 0 ? "tout l'historique" : `${windowSize} dernières parties`}
            {smooth ? " · moyenne glissante" : " · brut"}
          </span>
        </div>
        <div className="mt-3">
          {loading ? (
            <div className="flex h-56 items-center justify-center">
              <Spinner className="h-5 w-5 text-muted" />
            </div>
          ) : (
            <EloChart
              series={series}
              variant="analysis"
              height={380}
              smooth={smooth}
              smoothWindow={10}
              target={target}
              onSelectPoint={onSelectPoint}
            />
          )}
        </div>
      </Card>

      {tab === "both" && (
        <p className="text-[11px] text-subtle">
          Chaque courbe suit sa propre n-ième partie (Rapide et Blitz sont des classements séparés).
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold tracking-tight">Ce qui s'améliore (30 jours)</h2>
          {profile && profile.trends.improving.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {profile.trends.improving.map((t) => (
                <li key={t.key} className="text-sm">
                  <span className="font-medium text-ink">{t.label}</span>{" "}
                  <span className="text-eval-up">– {Math.abs(t.delta)} pts de part</span>{" "}
                  <span className="text-xs text-muted">
                    ({t.recent_share}% récent vs {t.overall_share}% global)
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Rien de nettement en amélioration ces 30 derniers jours.</p>
          )}
        </Card>
        <Card>
          <h2 className="text-sm font-semibold tracking-tight">À surveiller (30 jours)</h2>
          {profile && profile.trends.worsening.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {profile.trends.worsening.map((t) => (
                <li key={t.key} className="text-sm">
                  <span className="font-medium text-ink">{t.label}</span>{" "}
                  <span className="text-eval-down">+ {t.delta} pts de part</span>{" "}
                  <span className="text-xs text-muted">
                    ({t.recent_share}% récent vs {t.overall_share}% global)
                  </span>
                  <Link
                    to={`/training?concept=${t.key}`}
                    className="ml-2 text-xs font-medium text-accent hover:underline"
                  >
                    S'entraîner
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Rien de nettement en régression ces 30 derniers jours.</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="text-sm font-semibold tracking-tight">Historique des snapshots</h2>
        {history && history.dates.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-72 text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Elo</th>
                  <th className="py-2 font-medium">Parties analysées</th>
                </tr>
              </thead>
              <tbody>
                {history.dates.slice(-15).map((d, i) => (
                  <tr key={d + i} className="border-b border-line/50 last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{d}</td>
                    <td className="py-2 pr-3 tabular-nums">{history.elo[i] ?? "—"}</td>
                    <td className="py-2 tabular-nums">{history.games[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Les snapshots se créent à chaque recalcul du profil (et chaque nuit).
          </p>
        )}
      </Card>

      <p className="text-right text-xs text-muted">
        Les profils se recalculent automatiquement à chaque synchronisation.
      </p>
    </div>
  );
}
