import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerProfile, Stats } from "../types";
import { api, timeClassLabel } from "../api";
import { CLASS_LABEL, CLASS_COLOR } from "../constants";
import Markdown from "../components/Markdown";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Digest {
  period: string | null;
  facts: Record<string, unknown> | null;
  narrative: string | null;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.syncStatus>> | null>(null);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [genDigest, setGenDigest] = useState(false);

  const load = () => {
    api.stats().then(setStats).catch((e) => setErr(String(e)));
    api.syncStatus().then(setStatus).catch(() => {});
    api.profile().then(setProfile).catch(() => {});
    fetch("/api/digest/latest")
      .then((r) => r.json())
      .then(setDigest)
      .catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(() => {
      api.syncStatus().then(setStatus).catch(() => {});
    }, 10000);
    return () => clearInterval(t);
  }, []);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await api.sync(1);
    } catch (e) {
      console.error(e);
    }
    let waited = 0;
    const iv = setInterval(async () => {
      waited += 3000;
      const st = await api.syncStatus().catch(() => null);
      if (st) setStatus(st);
      if ((st && !st.running) || waited >= 90000) {
        clearInterval(iv);
        load();
        setSyncing(false);
      }
    }, 3000);
  };

  const generateDigest = async () => {
    setGenDigest(true);
    try {
      const res = await fetch("/api/digest/generate", { method: "POST" });
      const d = (await res.json()) as Digest;
      setDigest(d);
    } catch (e) {
      console.error(e);
    }
    setGenDigest(false);
  };

  if (err) return <div className="card">Erreur : {err}</div>;
  if (!stats) return <div className="card">Chargement…</div>;

  const classPie = (stats.by_time_class || []).map((c) => ({
    name: timeClassLabel[c.time_class] ?? c.time_class,
    value: c.games,
  }));

  const clsPie = Object.entries(stats.move_classifications || {}).map(([k, v]) => ({
    name: CLASS_LABEL[k] ?? k,
    value: v,
    color: CLASS_COLOR[k],
  }));

  return (
    <div className="dashboard">
      <div className="sync-bar">
        <span className="sync-status">
          {status?.running
            ? "Synchronisation en cours…"
            : status?.pending_analysis
              ? `${status.pending_analysis} partie(s) en attente d'analyse`
              : "À jour"}
        </span>
        {status?.last && !status.running && (
          <span className="sync-last">
            {status.last.games_new > 0
              ? ` · ${status.last.games_new} nouvelle(s) partie(s) récupérées`
              : " · dernières parties déjà en base"}
          </span>
        )}
        <button className="sync-btn" onClick={triggerSync} disabled={syncing || status?.running}>
          {syncing || status?.running ? "…" : "Récupérer les dernières parties"}
        </button>
      </div>

      <div className="stats-grid">
        {(stats.by_time_class || []).map((c) => (
          <Link
            key={c.time_class}
            to={`/games?time_class=${c.time_class}`}
            className="card link-card"
          >
            <h3>{timeClassLabel[c.time_class] ?? c.time_class}</h3>
            <div className="big">{c.games} <small>parties</small></div>
            <div className="stat-line"><b>{c.accuracy ?? "—"}%</b> précision</div>
            <div className="stat-line"><b>{c.acpl ?? "—"}</b> ACPL</div>
            <div className="wdl">
              <span className="w">{c.wins}</span>
              <span className="d">{c.draws}</span>
              <span className="l">{c.losses}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="charts-grid">
        <div className="card">
          <h3>Répartition des coups</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={clsPie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                {clsPie.map((c, i) => (
                  <Cell key={i} fill={c.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, color: "#1c1c1c" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend">
            {clsPie.map((c) => (
              <span key={c.name} className="legend-item">
                <i style={{ background: c.color }} />
                {c.name}
              </span>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Parties par format</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={classPie}>
              <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
              <XAxis dataKey="name" tick={{ fill: "#6b7280", fontSize: 12 }} />
              <YAxis tick={{ fill: "#6b7280", fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 8, color: "#1c1c1c" }} />
              <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Ouvertures les plus jouées</h3>
        <div className="table-wrap">
          <table className="table">
          <thead>
            <tr><th>ECO</th><th>Ouverture</th><th>Parties</th></tr>
          </thead>
          <tbody>
            {(stats.openings || []).map((o) => (
              <tr key={o.eco} className="row-click">
                <td>
                  <Link to={`/games?eco=${o.eco}`}>{o.eco}</Link>
                </td>
                <td>
                  <Link to={`/games?eco=${o.eco}`}>{o.opening_name || "—"}</Link>
                </td>
                <td>{o.n}</td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>

      {profile && profile.concepts_missing.length > 0 && (
        <div className="card">
          <div className="digest-head">
            <h3>À travailler</h3>
            <Link to="/practice">S'entraîner →</Link>
          </div>
          <div className="chips">
            {profile.concepts_missing.slice(0, 5).map((c) => (
              <Link key={c.key} to={`/practice?concept=${c.key}`} className="chip chip-link">
                {c.label} · <b>{c.n}</b> erreurs
              </Link>
            ))}
          </div>
          {profile.recommendations.length > 0 && (
            <p className="muted" style={{ marginTop: "0.6rem" }}>
              {profile.recommendations[0].titre} —{" "}
              {profile.recommendations[0].action.slice(0, 120)}…
            </p>
          )}
        </div>
      )}

      <div className="card digest-card">
        <div className="digest-head">
          <h3>Digest de la semaine</h3>
          <button onClick={generateDigest} disabled={genDigest}>
            {genDigest ? "…" : digest?.period ? "Régénérer" : "Générer"}
          </button>
        </div>
        {digest?.narrative ? (
          <Markdown text={digest.narrative} />
        ) : (
          <p className="muted">
            Le digest est généré la nuit par un agent LLM avec accès à tes stats. Tu peux aussi le générer à la demande.
          </p>
        )}
      </div>
    </div>
  );
}
