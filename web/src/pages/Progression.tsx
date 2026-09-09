import { useEffect, useMemo, useState } from "react";
import EloChart from "../components/EloChart";
import { Button, Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { TIME_CLASS_LABEL } from "../lib/constants";
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
  const [tab, setTab] = useState("global");
  const [period, setPeriod] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateMin, setDateMin] = useState("");
  const [dateMax, setDateMax] = useState("");
  const [eloMin, setEloMin] = useState<number | null>(null);
  const [eloMax, setEloMax] = useState<number | null>(null);

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
  }, []);

  const profile = profiles?.[tab] ?? profiles?.global ?? null;
  const hist = history[tab] ?? null;

  const cutoffMs = period > 0 ? Date.now() - period * 24 * 3600 * 1000 : 0;
  const withinPeriod = (d: string) => (cutoffMs === 0 ? true : new Date(d).getTime() >= cutoffMs);

  const eloData = useMemo(() => {
    if (hist && hist.dates.length > 1) {
      const pts = hist.dates
        .map((d, i) => ({ date: d, elo: hist.elo[i], games: hist.games[i] }))
        .filter((p) => p.elo !== null && p.elo !== undefined && withinPeriod(p.date));
      return pts;
    }
    return (profile?.progress.elo_curve || [])
      .filter((p) => withinPeriod(p.date))
      .map((p) => ({ date: p.date, elo: p.elo, games: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hist, profile, period]);

  // Courbes affichées : rapide + blitz superposées sur « Toutes cadences ».
  const eloSeries = useMemo(() => {
    const mk = (key: string, label: string, color: string) => {
      const h = history[key];
      if (h && h.dates && h.dates.length > 1) {
        const dates: string[] = [];
        const elo: (number | null)[] = [];
        for (let i = 0; i < h.dates.length; i++) {
          if (withinPeriod(h.dates[i])) {
            dates.push(h.dates[i]);
            elo.push(h.elo[i] ?? null);
          }
        }
        if (dates.length > 1) return { label, color, dates, elo };
      }
      return null;
    };
    if (tab === "global") {
      const out: { label: string; color: string; dates: string[]; elo: (number | null)[] }[] = [];
      const r = mk("rapid", "Rapide", "#6fa8dc");
      if (r) out.push(r);
      const b = mk("blitz", "Blitz", "#d9a441");
      if (b) out.push(b);
      if (out.length === 0 && eloData.length > 1) {
        out.push({ label: "Global", color: "#6fa8dc", dates: eloData.map((p) => p.date), elo: eloData.map((p) => Number(p.elo)) });
      }
      return out;
    }
    const one = mk(tab, tab === "rapid" ? "Rapide" : "Blitz", tab === "rapid" ? "#6fa8dc" : "#d9a441");
    return one ? [one] : eloData.length > 1
      ? [{ label: tab, color: "#6fa8dc", dates: eloData.map((p) => p.date), elo: eloData.map((p) => Number(p.elo)) }]
      : [];
  }, [tab, history, eloData, period]);

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
        {/* filtres période + plage elo */}
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
                  <span className="text-[#3fb562]">– {Math.abs(t.delta)} pts de part</span>{" "}
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
                  <span className="text-[#d9534f]">+ {t.delta} pts de part</span>{" "}
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