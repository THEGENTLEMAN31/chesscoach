import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, Spinner } from "../components/ui";
import { api } from "../lib/api";
import {
  formatDate,
  TIME_CLASS_LABEL,
} from "../lib/constants";

function playerResult(g: { player_color: string; result: string }): {
  label: string;
  cls: string;
} {
  if (g.result === "1/2-1/2")
    return { label: "Nulle", cls: "border-muted/50 text-muted" };
  const won =
    (g.player_color === "w" && g.result === "1-0") ||
    (g.player_color === "b" && g.result === "0-1");
  return won
    ? { label: "Victoire", cls: "border-accent/60 text-accent" }
    : { label: "Défaite", cls: "border-red-500/60 text-red-400" };
}

const ALL_STATUSES = [
  { value: "", label: "Tous" },
  { value: "analyzed", label: "Analysées" },
  { value: "pending", label: "En attente" },
];

export default function Games() {
  const navigate = useNavigate();
  const [timeClass, setTimeClass] = useState("");
  const [status, setStatus] = useState("analyzed");

  const gamesQ = useQuery({
    queryKey: ["games", timeClass, status],
    queryFn: () =>
      api.games({
        ...(timeClass ? { time_class: timeClass } : {}),
        ...(status ? { status } : {}),
        limit: "200",
      }),
  });

  const games = gamesQ.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Parties</h1>
        <p className="mt-0.5 text-sm text-muted">
          {gamesQ.data ? `${gamesQ.data.total} parties` : "Chargement…"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => navigate("/import")}
          className="h-8 px-3 text-xs"
        >
          + Importer une partie
        </Button>
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {(["", "rapid", "blitz", "bullet"] as const).map((tc) => (
            <button
              key={tc}
              onClick={() => setTimeClass(tc)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                timeClass === tc
                  ? "bg-surface-3 text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {TIME_CLASS_LABEL[tc] ?? "Tous"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-2 p-1">
          {ALL_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatus(s.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                status === s.value ? "bg-surface-3 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {gamesQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-5 w-5 text-muted" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {games.map((g) => {
            const res = playerResult(g);
            return (
              <Link key={g.id} to={`/games/${g.id}`}>
                <Card className="flex items-center gap-3 py-3 transition-colors hover:border-accent/50">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {g.white} <span className="text-muted">vs</span> {g.black}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {formatDate(g.end_time)} ·{" "}
                      {TIME_CLASS_LABEL[g.time_class] ?? g.time_class}
                      {g.time_class === "rapid" && g.time_control
                        ? ` · ${g.time_control}`
                        : ""}
                      {g.opening_name ? ` · ${g.opening_name}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${res.cls}`}>
                      {res.label}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {g.accuracy !== null && g.accuracy !== undefined
                        ? `${g.accuracy}% · ${g.acpl ?? "—"} aCPL`
                        : "—"}
                    </span>
                  </div>
                </Card>
              </Link>
            );
          })}
          {games.length === 0 && !gamesQ.isLoading ? (
            <p className="py-16 text-center text-sm text-muted">
              Aucune partie ne correspond à ces filtres.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}