import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GameOut } from "../types";
import { api, timeClassLabel, formatDate } from "../api";
import { CLASS_LABEL, CLASS_COLOR } from "../constants";

export default function GamesList() {
  const [games, setGames] = useState<GameOut[]>([]);
  const [timeClass, setTimeClass] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    const params: Record<string, string> = { limit: "200" };
    if (timeClass) params.time_class = timeClass;
    api
      .games(params)
      .then(setGames)
      .catch((e) => setErr(String(e)));
  };

  useEffect(load, [timeClass]);

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
        <span className="count">{games.length} partie(s)</span>
      </div>

      {err && <div className="card">Erreur : {err}</div>}

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
              <tr key={g.id}>
                <td>{formatDate(g.end_time)}</td>
                <td>
                  {opponent} ({oppElo ?? "?"})
                </td>
                <td className={win ? "c-win" : draw ? "c-draw" : "c-loss"}>
                  {win ? "Victoire" : draw ? "Nulle" : "Défaite"}
                </td>
                <td>{timeClassLabel[g.time_class] ?? g.time_class}</td>
                <td className="open-cell">
                  <Link to={`/games/${g.id}`}>{g.opening_name || g.eco || "—"}</Link>
                </td>
                <td>{g.accuracy !== null ? `${g.accuracy}%` : "—"}</td>
                <td>{g.acpl ?? "—"}</td>
                <td>
                  {g.classifications && (
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
