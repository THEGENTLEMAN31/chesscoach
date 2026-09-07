import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { GameOut } from "../types";
import { api, timeClassLabel, formatDate } from "../api";
import { CLASS_LABEL, CLASS_COLOR } from "../constants";

const PAGE_SIZE = 200;

export default function GamesList() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [games, setGames] = useState<GameOut[]>([]);
  const [total, setTotal] = useState(0);
  const [timeClass, setTimeClass] = useState("");
  const [status, setStatus] = useState("");
  const [eco, setEco] = useState(params.get("eco") ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const load = (offs: number) => {
    setLoading(true);
    const p: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(offs) };
    if (timeClass) p.time_class = timeClass;
    if (status) p.status = status;
    if (eco) p.eco = eco;
    api
      .games(p)
      .then((page) => {
        setTotal(page.total);
        setGames(offs === 0 ? page.items : (prev) => [...prev, ...page.items]);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setOffset(0);
    load(0);
  }, [timeClass, status, eco]);

  return (
    <div className="games">
      <div className="card filters">
        <label>
          Format :
          <select value={timeClass} onChange={(e) => setTimeClass(e.target.value)}>
            <option value="">Tous</option>
            <option value="rapid">Rapide</option>
            <option value="blitz">Blitz</option>
          </select>
        </label>
        <label>
          Statut :
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous</option>
            <option value="analyzed">Analysées</option>
            <option value="synced">En attente d'analyse</option>
          </select>
        </label>
        {eco && (
          <span className="chip">
            ECO {eco}{" "}
            <button className="chip-clear" onClick={() => setEco("")} title="Retirer le filtre">
              ✕
            </button>
          </span>
        )}
        <span className="count">{loading ? "Chargement…" : `${games.length} / ${total} partie(s)`}</span>
      </div>

      {err && <div className="card">Erreur : {err}</div>}

      {!loading && games.length === 0 ? (
        <div className="card empty-state">
          <p className="muted">Aucune partie à afficher.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table card">
          <thead>
            <tr>
              <th>Date</th>
              <th>Adversaire</th>
              <th>Résultat</th>
              <th>Format</th>
              <th>Ouverture</th>
              <th>Précision</th>
              <th>ACPL</th>
              <th>Erreurs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => {
              const opponent = g.player_color === "w" ? g.black : g.white;
              const oppElo = g.player_color === "w" ? g.black_elo : g.white_elo;
              const win =
                (g.player_color === "w" && g.result.startsWith("1-0")) ||
                (g.player_color === "b" && g.result.startsWith("0-1"));
              const draw = g.result.startsWith("1/2");
              return (
                <tr
                  key={g.id}
                  className="row-click"
                  onClick={() => navigate(`/games/${g.id}`)}
                  title="Ouvrir la partie"
                >
                  <td>{formatDate(g.end_time)}</td>
                  <td>
                    {opponent} ({oppElo ?? "?"})
                  </td>
                  <td className={win ? "c-win" : draw ? "c-draw" : "c-loss"}>
                    {win ? "Victoire" : draw ? "Nulle" : "Défaite"}
                  </td>
                  <td>{timeClassLabel[g.time_class] ?? g.time_class}</td>
                  <td>{g.opening_name || g.eco || "—"}</td>
                  <td>
                    {g.status === "analyzed" ? `${g.accuracy ?? "—"}%` : <span className="badge-wait">en attente</span>}
                  </td>
                  <td>{g.status === "analyzed" ? (g.acpl ?? "—") : "—"}</td>
                  <td>
                    {g.status === "analyzed" && g.classifications && (
                      <span className="err-badges">
                        {Object.entries(g.classifications)
                          .filter(([k]) => k === "blunder" || k === "mistake")
                          .map(([k, v]) =>
                            v ? (
                              <span key={k} className="badge" style={{ color: CLASS_COLOR[k] }}>
                                {CLASS_LABEL[k]}: {v}
                              </span>
                            ) : null,
                          )}
                      </span>
                    )}
                  </td>
                  <td className="open-cell">→</td>
                </tr>
              );
            })}
          </tbody>
          </table>
        </div>
      )}

      {games.length < total && (
        <div className="filters" style={{ marginTop: "0.6rem" }}>
          <button
            onClick={() => {
              const o = offset + PAGE_SIZE;
              setOffset(o);
              load(o);
            }}
            disabled={loading}
          >
            {loading ? "Chargement…" : "Charger plus"}
          </button>
        </div>
      )}
    </div>
  );
}
