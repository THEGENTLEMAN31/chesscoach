import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PlayerProfile, ProfileHistory } from "../types";
import { api } from "../api";

const TABS = [
  { key: "global", label: "Global" },
  { key: "rapid", label: "Rapide" },
  { key: "blitz", label: "Blitz" },
];

export default function Progression() {
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile> | null>(null);
  const [history, setHistory] = useState<Record<string, ProfileHistory>>({});
  const [tab, setTab] = useState("global");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .profileAll("thegentleman31")
      .then((res) => setProfiles(res.profiles))
      .catch((e) => setErr(String(e)));
    for (const t of TABS) {
      api
        .profileHistory("thegentleman31", t.key)
        .then((h) => setHistory((prev) => ({ ...prev, [t.key]: h })))
        .catch(() => {});
    }
  }, []);

  const profile = profiles?.[tab] ?? profiles?.global ?? null;
  const hist = history[tab] ?? null;

  const eloData = useMemo(() => {
    if (hist && hist.dates.length > 1) {
      return hist.dates.map((d, i) => ({ date: d, elo: hist.elo[i], games: hist.games[i] }));
    }
    return (profile?.progress.elo_curve || []).map((p) => ({ date: p.date, elo: p.elo }));
  }, [hist, profile]);

  if (err) return <div className="card">Erreur : {err}</div>;
  if (!profiles || !profile) return <div className="card">Chargement…</div>;

  return (
    <div className="progression">
      <div className="tabbar">
        {TABS.map((t) => {
          const g = profiles[t.key];
          const n = g ? g.games.n : 0;
          return (
            <button
              key={t.key}
              className={`tab${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} <span className="muted">({n} parties)</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <h3>Courbe Elo</h3>
        {eloData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={eloData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} />
              <YAxis domain={["dataMin - 50", "dataMax + 50"]} tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, color: "#1c1c1c" }} />
              <Line type="monotone" dataKey="elo" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="muted">Pas encore assez de points pour tracer la courbe.</p>
        )}
        <div className="stat-line">
          Tendance : <b>{profile.progress.elo_trend ?? "—"}</b> élo · Précision :{" "}
          <b>{profile.progress.accuracy_trend ?? "—"}</b> pts
        </div>
      </div>

      <div className="cards-2col">
        <div className="card">
          <h3>Ce qui s'améliore (30 jours)</h3>
          {profile.trends.improving.length > 0 ? (
            <ul className="list">
              {profile.trends.improving.map((t) => (
                <li key={t.key}>
                  <b>{t.label}</b>{" "}
                  <span className="good">– {Math.abs(t.delta)} pts de part</span>{" "}
                  <span className="muted">
                    ({t.recent_share}% récent vs {t.overall_share}% global)
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Rien de nettement en amélioration ces 30 derniers jours.</p>
          )}
        </div>

        <div className="card">
          <h3>Ce qui se dégrade (30 jours)</h3>
          {profile.trends.worsening.length > 0 ? (
            <ul className="list">
              {profile.trends.worsening.map((t) => (
                <li key={t.key}>
                  <b>{t.label}</b> <span className="bad">+ {t.delta} pts de part</span>{" "}
                  <span className="muted">
                    ({t.recent_share}% récent vs {t.overall_share}% global)
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Rien de nettement en régression ces 30 derniers jours.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Historique des snapshots</h3>
        {hist && hist.dates.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Elo</th>
                <th>Parties analysées</th>
              </tr>
            </thead>
            <tbody>
              {hist.dates.slice(-15).map((d, i) => (
                <tr key={d + i}>
                  <td>{d}</td>
                  <td>{hist.elo[i] ?? "—"}</td>
                  <td>{hist.games[i]}</td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">
            Les snapshots se créent à chaque recalcule du profil (et chaque nuit).
          </p>
        )}
      </div>
    </div>
  );
}
