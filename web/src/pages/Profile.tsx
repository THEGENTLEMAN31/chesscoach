import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { PlayerProfile } from "../types";
import { api } from "../api";

function Bar({ value, color = "#38bdf8" }: { value: number; color?: string }) {
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${Math.min(100, value)}%`, background: color }} />
    </div>
  );
}

const TABS = [
  { key: "global", label: "Global" },
  { key: "rapid", label: "Rapide" },
  { key: "blitz", label: "Blitz" },
];

export default function Profile() {
  const [profiles, setProfiles] = useState<Record<string, PlayerProfile> | null>(null);
  const [tab, setTab] = useState("global");
  const [err, setErr] = useState<string | null>(null);
  const [recomputing, setRecomputing] = useState(false);

  const load = (recompute = false) => {
    api
      .profileAll("thegentleman31", recompute)
      .then((res) => setProfiles(res.profiles))
      .catch((e) => setErr(String(e)));
  };

  useEffect(() => load(false), []);

  const recompute = async () => {
    setRecomputing(true);
    try {
      await load(true);
    } catch (e) {
      setErr(String(e));
    }
    setRecomputing(false);
  };

  if (err) return <div className="card">Erreur : {err}</div>;
  if (!profiles) return <div className="card">Chargement…</div>;

  const profile = profiles[tab] ?? profiles.global ?? null;
  if (!profile) return <div className="card">Aucun profil disponible.</div>;

  const maxCause = Math.max(1, ...profile.root_causes.map((c) => c.share));
  const maxConcept = Math.max(1, ...profile.concepts_missing.map((c) => c.n));
  const etudes = profile.etudes ?? { n: 0, correct: 0, correct_rate: 0, by_concept: [], last_7d: 0 };

  return (
    <div className="profile">
      <div className="card profile-head">
        <div>
          <h2>Profil de {profile.username}</h2>
          <p className="muted">
            Calculé à partir de {profile.games.n} parties analysées · dernière partie{" "}
            {profile.games.last_game || "—"} ·{" "}
            {profile.computed_at.replace("T", " ").slice(0, 16)}
          </p>
        </div>
        <button onClick={recompute} disabled={recomputing}>
          {recomputing ? "…" : "Recalculer"}
        </button>
      </div>

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

      <div className="stats-grid">
        <div className="card">
          <h3>Elo actuel</h3>
          <div className="big">
            {profile.rating.latest ?? "—"} <small>élo</small>
          </div>
          <div className="stat-line">
            <b>{profile.progress.elo_trend ?? "—"}</b> de tendance (30j)
          </div>
          <div className="stat-line muted">
            min {profile.rating.min ?? "—"} · max {profile.rating.max ?? "—"}
          </div>
        </div>
        <div className="card">
          <h3>Objectif</h3>
          {profile.objective.targets ? (
            <>
              <div className="big">
                Rapide 2000 <small>· Blitz 1800</small>
              </div>
              <div className="stat-line muted">
                cible Elo propre à chaque format
              </div>
            </>
          ) : (
            <>
              <div className="big">
                {profile.objective.target_elo ?? "—"} <small>élo visé</small>
              </div>
              <div className="stat-line">
                encore <b>{profile.objective.gap ?? "—"}</b> points · ~
                <b>{profile.objective.months_estimated ?? "—"}</b> mois
              </div>
              <div className="stat-line muted">
                progression actuelle : {profile.objective.progression_pct ?? "—"}%
              </div>
            </>
          )}
        </div>
        <div className="card">
          <h3>Conversion</h3>
          <div className="big">
            {profile.conversion.conversion_rate}% <small>positions gagnantes</small>
          </div>
          <div className="stat-line">
            <b>{profile.conversion.won_blown}</b> parties gagnées laissées filer
          </div>
          <div className="stat-line muted">
            remontées : {profile.conversion.lost_saved}
          </div>
        </div>
        <div className="card">
          <h3>Études posées</h3>
          <div className="big">
            {etudes.n} <small>exercices</small>
          </div>
          <div className="stat-line">
            <b>{etudes.correct_rate}%</b> de réussite ({etudes.correct}/{etudes.n})
          </div>
          <div className="stat-line muted">
            {etudes.last_7d} cette semaine
          </div>
          {etudes.by_concept && etudes.by_concept.length > 0 && (
            <div className="stat-line muted">
              souvent : {etudes.by_concept.map((c) => c.concept).join(", ")}
            </div>
          )}
          <div className="stat-line">
            <Link to="/practice" className="btn-link">
              S'entraîner →
            </Link>
          </div>
        </div>
      </div>

      <div className="cards-2col">
        <div className="card">
          <h3>Forces</h3>
          <ul className="list">
            {profile.strengths.map((s) => (
              <li key={s.label}>
                <b>{s.label}</b>
                {s.detail && <span className="muted"> — {s.detail}</span>}
              </li>
            ))}
            {profile.strengths.length === 0 && <li className="muted">Pas encore de force dégagée.</li>}
          </ul>
        </div>

        <div className="card">
          <h3>Faiblesses par famille</h3>
          {profile.weaknesses.map((w) => (
            <div key={w.family} className="bar-row">
              <div className="bar-label">
                <span>{w.family}</span>
                <span className="muted">
                  {w.n} erreurs · {w.blunders} bévues · perte moy. {w.avg_loss}%
                </span>
              </div>
              <Bar value={w.share} color={w.share > 30 ? "#ef4444" : "#f97316"} />
            </div>
          ))}
        </div>
      </div>

      <div className="cards-2col">
        <div className="card">
          <h3>Concepts à travailler</h3>
          {profile.concepts_missing.map((c) => (
            <div key={c.label} className="bar-row">
              <div className="bar-label">
                <span>{c.label}</span>
                <span className="muted">
                  {c.n}× · perte moy. {c.avg_loss}%
                </span>
              </div>
              <Bar value={(c.n / maxConcept) * 100} color="#eab308" />
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Causes racines</h3>
          {profile.root_causes.map((c) => (
            <div key={c.label} className="bar-row">
              <div className="bar-label">
                <span>{c.label}</span>
                <span className="muted">{c.share}%</span>
              </div>
              <Bar value={(c.share / maxCause) * 100} color="#38bdf8" />
            </div>
          ))}
        </div>
      </div>

      <div className="cards-2col">
        <div className="card">
          <h3>Style de jeu</h3>
          <div className="stat-line">
            temps moyen : <b>{profile.style.avg_time_per_move}s</b> par coup ·{" "}
            <b>{profile.style.fast_move_pct}%</b> de coups en &lt; 5 s
          </div>
          <div className="stat-line">
            captures : <b>{profile.style.capture_pct}%</b> · sacrifices :{" "}
            <b>{profile.style.sacrifices}</b>
          </div>
          <h4>Ouvertures préférées</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Ouverture</th>
                <th>Parties</th>
                <th>% gains</th>
              </tr>
            </thead>
            <tbody>
              {(profile.style.openings || []).map((o) => (
                <tr key={o.name}>
                  <td>{o.name}</td>
                  <td>{o.n}</td>
                  <td>{o.winrate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Mental</h3>
          {profile.mental.map((m) => (
            <div key={m.label} className="stat-line">
              <b>{m.label}</b> = {m.value}
              {m.detail && <div className="muted">{m.detail}</div>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Ton programme (prescription)</h3>
        <div className="reco-grid">
          {profile.recommendations.map((r) => (
            <div key={r.priority} className="reco-item">
              <span className="reco-badge">{r.priority}</span>
              <div>
                <b>{r.titre}</b>
                <p className="muted">{r.action}</p>
              </div>
            </div>
          ))}
          {profile.recommendations.length === 0 && (
            <p className="muted">Pas encore de prescription : recalcule le profil.</p>
          )}
        </div>
      </div>

      <div className="cards-2col">
        <div className="card">
          <h3>Améliorations (30 jours)</h3>
          {profile.trends.improving.length ? (
            <ul className="list">
              {profile.trends.improving.map((t) => (
                <li key={t.key}>
                  <b>{t.label}</b>{" "}
                  <span className="good">–{Math.abs(t.delta)} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Aucune amélioration nette.</p>
          )}
        </div>
        <div className="card">
          <h3>Régressions (30 jours)</h3>
          {profile.trends.worsening.length ? (
            <ul className="list">
              {profile.trends.worsening.map((t) => (
                <li key={t.key}>
                  <b>{t.label}</b> <span className="bad">+{t.delta} pts</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Aucune régression nette.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Hypothèses du coach</h3>
        <ul className="list">
          {profile.cognitive.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
