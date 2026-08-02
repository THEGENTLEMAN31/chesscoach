import { useEffect, useState } from "react";
import type { Stats } from "../types";
import { api, timeClassLabel } from "../api";
import { CLASS_LABEL, CLASS_COLOR } from "../constants";
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

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.syncStatus>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = () => {
    api.stats().then(setStats).catch((e) => setErr(String(e)));
    api.syncStatus().then(setStatus).catch(() => {});
  };

  useEffect(load, []);

  const triggerSync = async () => {
    setSyncing(true);
    await api.sync(1);
    setTimeout(() => {
      load();
      setSyncing(false);
    }, 2000);
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
      <div className="card sync-card">
        <h2>Synchronisation</h2>
        <p>
          {status?.running
            ? "Pipeline en cours…"
            : status?.pending_analysis
              ? `${status.pending_analysis} partie(s) en attente d'analyse`
              : "À jour"}
          {" · "}
          {status?.last ? `${status.last.games_seen} vues · ${status.last.games_new} nouvelles` : "aucun run"}
        </p>
        <button onClick={triggerSync} disabled={syncing || status?.running}>
          {syncing || status?.running ? "…" : "Synchroniser"}
        </button>
      </div>

      <div className="stats-grid">
        {(stats.by_time_class || []).map((c) => (
          <div key={c.time_class} className="card">
            <h3>{timeClassLabel[c.time_class] ?? c.time_class}</h3>
            <div className="big">{c.games} <small>parties</small></div>
            <div className="stat-line"><b>{c.accuracy ?? "—"}%</b> précision</div>
            <div className="stat-line"><b>{c.acpl ?? "—"}</b> ACPL</div>
            <div className="wdl">
              <span className="w">{c.wins}</span>
              <span className="d">{c.draws}</span>
              <span className="l">{c.losses}</span>
            </div>
          </div>
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
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }} />
              <Bar dataKey="value" fill="#38bdf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Ouvertures les plus jouées</h3>
        <table className="table">
          <thead>
            <tr><th>ECO</th><th>Ouverture</th><th>Parties</th></tr>
          </thead>
          <tbody>
            {(stats.openings || []).map((o) => (
              <tr key={o.eco}>
                <td>{o.eco}</td>
                <td>{o.opening_name || "—"}</td>
                <td>{o.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
