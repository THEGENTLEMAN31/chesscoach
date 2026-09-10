import { useEffect, useMemo, useState } from "react";
import EloChart from "../components/EloChart";
import { Button, Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { TIME_CLASS_LABEL } from "../lib/constants";
import type { GameOut } from "../lib/types";
import type { PlayerProfile } from "../lib/profile-types";

interface ProfileHistory {
  dates: string[];
  elo: (number | null)[];
  games: number[];
}

const TABS = [
  { key: "global", label: "Global" },
  { key: "rapid", label: "Rapide" },
  { key: "blitz", label: "Blitz" },
];

const PERIODS: { value: number; label: string }[] = [
  { value: 0, label: "Tout" },
  { value: 30, label: "30 j" },
  { value: 90, label: "90 j" },
  { value: 365, label: "1 an" },
];

export default function Progression() {
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile> | null>(null);
  const [history, setHistory] = useState<Record<string, ProfileHistory>>({});
  const [games, setGames] = useState<Record<string, GameOut[]>>({});
  const [tab, setTab] = useState("global");
  const [period, setPeriod] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [eloMin, setEloMin] = useState<number | null>(null);
  const [eloMax, setEloMax] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .profileAll()
      .then((res) => {
        const p: Record<string, PlayerProfile> = {};
        for (const [k, v] of Object.entries(res.profiles)) {
          p[k] = v as unknown as PlayerProfile;
        }
        setProfiles(p);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
    for (const t of TABS) {
      api
        .profileHistory(t.key)
        .then((h) => setHistory((prev) => ({ ...prev, [t.key]: h as unknown as ProfileHistory })))
        .catch(() => {});
    }
    for (const tc of ["rapid", "blitz"]) {
      api
        .games({ time_class: tc, limit: "500" })
        .then((g) => setGames((prev) => ({ ...prev, [tc]: g.items })))
        .catch(() => {});
    }
  }, []);

  const profile = profiles?.[tab] ?? profiles?.global ?? null;
  const hist = history[tab] ?? null;

  const cutoffMs = period > 0 ? Date.now() - period * 24 * 3600 * 1000 : 0;

  // Courbe par partie : on utilise les elo réels de chaque partie analysée.
  const visible = (iso: string, elo: number | null) => {
    if (elo == null) return false;
    if (cutoffMs > 0 && Date.parse(iso) < cutoffMs) return false;
    if (dateMin && Date.parse(iso) < Date.parse(dateMin)) return false;
    if (dateMax && Date.parse(iso) > Date.parse(dateMax) + 86_399_999) return false;
    if (eloMin != null && elo < eloMin) return false;
    if (eloMax != null && elo > eloMax) return false;
    return true;
  };

  const ptsFor = (tc: string) => {
    const pts: { date: string; elo: number }[] = [];
    for (const g of games[tc] ?? []) {
      if (!g.end_time) continue;
      const elo = g.player_color === "w" ? g.white_elo : g.black_elo;
      if (elo == null) continue;
      const iso = new Date(g.end_time * 1000).toISOString();
      if (!visible(iso, elo)) continue;
      pts.push({ date: iso, elo });
    }
    pts.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return pts;
  };

  const eloData = useMemo(() => {
    const tcs = tab === "global" ? ["rapid", "blitz"] : [tab];
    const pts = tcs.flatMap((tc) => ptsFor(tc));
    pts.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, games, period, dateMin, dateMax, eloMin, eloMax]);

  // Courbes affichées : rapide + blitz superposées sur « Toutes cadences ».
  const eloSeries = useMemo(() => {
    const mk = (tc: string, label: string, color: string) => {
      const pts = ptsFor(tc);
      if (pts.length > 1)
        return { label, color, dates: pts.map((p) => p.date), elo: pts.map((p) => p.elo) };
      return null;
    };
    if (tab === "global") {
      const out: { label: string; color: string; dates: string[]; elo: number[] }[] = [];
      const r = mk("rapid", "Rapide", "#6fa8dc");
      if (r) out.push(r);
      const b = mk("blitz", "Blitz", "#d9a441");
      if (b) out.push(b);
      if (out.length === 0 && eloData.length > 1)
        out.push({ label: "Global", color: "#6fa8dc", dates: eloData.map((p) => p.date), elo: eloData.map((p) => p.elo) });
      return out;
    }
    const label = TIME_CLASS_LABEL[tab] ?? tab;
    const one = mk(tab, label, tab === "rapid" ? "#6fa8dc" : "#d9a441");
    if (one) return [one];
    return eloData.length > 1
      ? [{ label, color: "#6fa8dc", dates: eloData.map((p) => p.date), elo: eloData.map((p) => p.elo) }]
      : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, games, eloData, period, dateMin, dateMax, eloMin, eloMax]);

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
  if (loading || !profiles || !profile) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">Progression</h1>
        <div className="flex justify-center py-16">
          <Spinner className="h-5 w-5 text-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Progression</h1>
        <p className="mt-0.5 text-sm text-muted">
          Courbes d'elo et tendances sur tes parties analysées.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const g = profiles[t.key];
          const n = g ? g.games.n : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.key
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-line text-muted hover:text-ink"
              }`}
            >
              <span className="capitalize">{TIME_CLASS_LABEL[t.key] ?? t.label}</span>{" "}
              <span className="text-muted tabular-nums">({n} parties)</span>
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Courbe Elo</h2>
          <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p.value ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {/* filtres période + plage elo (repliables) */}
        <div className="mt-2">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors hover:text-ink"
            aria-expanded={filtersOpen}
          >
            Filtres
            <svg
              className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
            {(dateMin || dateMax || eloMin != null || eloMax != null) && (
              <span className="rounded bg-accent/15 px-1 py-px text-[10px] font-semibold text-accent">
                actifs
              </span>
            )}
          </button>
          {filtersOpen && (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                Du
                <input type="date" value={dateMin} onChange={(e) => setDateMin(e.target.value)} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                Au
                <input type="date" value={dateMax} onChange={(e) => setDateMax(e.target.value)} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                Elo min
                <input type="number" value={eloMin ?? ""} onChange={(e) => setEloMin(e.target.value === "" ? null : Number(e.target.value))} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink" />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-muted">
                Elo max
                <input type="number" value={eloMax ?? ""} onChange={(e) => setEloMax(e.target.value === "" ? null : Number(e.target.value))} className="rounded-md border border-line bg-surface-2 px-2 py-1 text-xs text-ink" />
              </label>
            </div>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {eloData.length > 0 ? (
            <>
              <span className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-xs tabular-nums text-muted">
                Départ : <b className="text-ink">{eloData[0].elo}</b>
                <span className="text-muted"> ({String(eloData[0].date).slice(0, 10)})</span>
              </span>
              <span className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-xs tabular-nums text-muted">
                Actuel : <b className="text-ink">{eloData[eloData.length - 1].elo}</b>
                <span className="text-muted"> ({String(eloData[eloData.length - 1].date).slice(0, 10)})</span>
              </span>
              <span className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-xs tabular-nums text-muted">
                Max : <b className="text-ink">{Math.max(...eloData.map((p) => Number(p.elo)))}</b>
              </span>
              <span className="rounded-md border border-line bg-surface-2/60 px-2 py-0.5 text-xs tabular-nums text-muted">
                Min : <b className="text-ink">{Math.min(...eloData.map((p) => Number(p.elo)))}</b>
              </span>
            </>
          ) : (
            <span className="text-sm text-muted">Aucune donnée sur cette période.</span>
          )}
        </div>
        <div className="mt-2">
          <EloChart
            series={eloSeries}
            dateMin={dateMin || null}
            dateMax={dateMax || null}
            eloMin={eloMin}
            eloMax={eloMax}
          />
        </div>
        <p className="mt-3 text-xs text-muted">
          Tendance : <b className="text-ink">{profile.progress.elo_trend ?? "—"}</b> elo · Précision :{" "}
          <b className="text-ink">{profile.progress.accuracy_trend ?? "—"}</b> pts
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold tracking-tight">Ce qui s'améliore (30 jours)</h2>
          {profile.trends.improving.length > 0 ? (
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
          <h2 className="text-sm font-semibold tracking-tight">Ce qui se dégrade (30 jours)</h2>
          {profile.trends.worsening.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {profile.trends.worsening.map((t) => (
                <li key={t.key} className="text-sm">
                  <span className="font-medium text-ink">{t.label}</span>{" "}
                  <span className="text-eval-down">+ {t.delta} pts de part</span>{" "}
                  <span className="text-xs text-muted">
                    ({t.recent_share}% récent vs {t.overall_share}% global)
                  </span>
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
        {hist && hist.dates.length > 0 ? (
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
                {hist.dates.slice(-15).map((d, i) => (
                  <tr key={d + i} className="border-b border-line/50 last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{d}</td>
                    <td className="py-2 pr-3 tabular-nums">{hist.elo[i] ?? "—"}</td>
                    <td className="py-2 tabular-nums">{hist.games[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Les snapshots se créent à chaque recalcule du profil (et chaque nuit).
          </p>
        )}
      </Card>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          onClick={() => {
            api.profileAll(true).then(() => window.location.reload()).catch(() => {});
          }}
          className="px-3 py-1.5 text-xs"
        >
          Recalculer les profils
        </Button>
      </div>
    </div>
  );
}