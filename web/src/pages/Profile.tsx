import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Card, Spinner, Stat } from "../components/ui";
import { api } from "../lib/api";
import { useSession } from "../lib/session";
import { useToast } from "../lib/toast";
import type { PlayerProfile } from "../lib/profile-types";

export default function Profile() {
  const { user } = useSession();
  const { push } = useToast();
  const [timeClass, setTimeClass] = useState("global");
  const [recomputing, setRecomputing] = useState(false);
  const [objRapid, setObjRapid] = useState("");
  const [objBlitz, setObjBlitz] = useState("");
  const [savingObj, setSavingObj] = useState(false);

  const profileQ = useQuery({
    queryKey: ["profile", timeClass],
    queryFn: () => api.profile(timeClass),
    staleTime: 60_000,
  });

  const objectivesQ = useQuery({
    queryKey: ["objectives"],
    queryFn: api.objectives,
  });

  const profile = profileQ.data as PlayerProfile | undefined;

  const target =
    (profile?.objective.targets?.[timeClass] ?? profile?.objective.target_elo) ??
    null;
  const gap = profile?.objective.gap ?? null;

  const recompute = async () => {
    setRecomputing(true);
    try {
      await api.profileRecompute(timeClass);
      await profileQ.refetch();
    } catch {
      /* message via UI */
    } finally {
      setRecomputing(false);
    }
  };

  const saveObjectives = async () => {
    setSavingObj(true);
    try {
      const rapid = objRapid === "" ? null : Number(objRapid);
      const blitz = objBlitz === "" ? null : Number(objBlitz);
      await api.setObjectives({ rapid, blitz });
      await Promise.all([profileQ.refetch(), objectivesQ.refetch()]);
      push("success", "Objectif mis à jour.");
    } catch {
      push("error", "Impossible d'enregistrer l'objectif.");
    } finally {
      setSavingObj(false);
    }
  };

  const targets = objectivesQ.data?.targets ?? {};

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Profil joueur</h1>
          <p className="mt-0.5 text-sm text-muted">{user?.chesscom_username}</p>
        </div>
        <Button variant="ghost" onClick={() => void recompute()} disabled={recomputing} className="px-3 py-1.5 text-xs">
          {recomputing ? "Calcul…" : "Recalculer"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["global", "rapid", "blitz"] as const).map((tc) => (
          <button
            key={tc}
            onClick={() => setTimeClass(tc)}
            className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
              timeClass === tc
                ? "border-accent bg-accent/10 text-accent"
                : "border-line text-muted hover:text-ink"
            }`}
          >
            {tc === "global" ? "Toutes cadences" : tc}
          </button>
        ))}
      </div>

      <Card>
        <h2 className="text-sm font-semibold tracking-tight">Objectif Elo par format</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Rapide
            <input
              type="number"
              placeholder={String(targets.rapid ?? 2000)}
              value={objRapid}
              onChange={(e) => setObjRapid(e.target.value)}
              className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink placeholder:text-muted/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Blitz
            <input
              type="number"
              placeholder={String(targets.blitz ?? 1800)}
              value={objBlitz}
              onChange={(e) => setObjBlitz(e.target.value)}
              className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink placeholder:text-muted/50"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Laisse vide pour garder la cible actuelle ({targets.rapid ?? 2000} /{" "}
          {targets.blitz ?? 1800}). Le profil est recalculé automatiquement.
        </p>
        <Button onClick={() => void saveObjectives()} disabled={savingObj} className="mt-3 px-3 py-1.5 text-xs">
          {savingObj ? "Enregistrement…" : "Enregistrer mes objectifs"}
        </Button>
      </Card>

      {profileQ.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-5 w-5 text-muted" />
        </div>
      ) : profile ? (
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <Card className="col-span-2 flex flex-wrap gap-4">
            <Stat label="Parties analysées" value={profile.games?.n ?? "—"} />
            <Stat label="Elo récent" value={profile.rating?.latest ?? "—"} />
            <Stat label="Elo max" value={profile.rating?.max ?? "—"} />
            {target !== null ? (
              <Stat
                label={timeClass === "global" ? "Objectif" : `Objectif ${timeClass}`}
                value={target}
                sub={gap !== null ? `${gap > 0 ? "+" : ""}${gap} d'écart` : undefined}
              />
            ) : null}
            <Stat label="Progression" value={profile.objective?.progression_pct ?? "—"} sub="vers l'objectif" />
          </Card>
          {profile.strengths && profile.strengths.length > 0 ? (
            <Card className="col-span-2">
              <h2 className="text-sm font-medium text-muted">Forces</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {profile.strengths.map((s, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{s.label}</span>
                    <span className="text-muted text-xs tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {profile.weaknesses && profile.weaknesses.length > 0 ? (
            <Card className="col-span-2">
              <h2 className="text-sm font-medium text-muted">Faiblesses</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {profile.weaknesses.map((w, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{w.family}</span>
                    <span className="text-muted text-xs tabular-nums">CPL +{w.avg_loss.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {profile.concepts_missing && profile.concepts_missing.length > 0 ? (
            <Card className="col-span-2">
              <h2 className="text-sm font-medium text-muted">Concepts à travailler</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {profile.concepts_missing.map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{c.label}</span>
                    <span className="text-muted text-xs tabular-nums">
                      {c.n} coup{c.n > 1 ? "s" : ""}
                      {c.blunders > 0 ? ` · ${c.blunders} gaffe${c.blunders > 1 ? "s" : ""}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {profile.root_causes && profile.root_causes.length > 0 ? (
            <Card className="col-span-2">
              <h2 className="text-sm font-medium text-muted">Causes racines</h2>
              <ul className="mt-2 flex flex-col gap-1.5">
                {profile.root_causes.map((c, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                    <span>{c.label}</span>
                    <span className="text-muted text-xs tabular-nums">{Math.round(c.share * 100)}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Profil indisponible — lance une synchronisation puis un recalcul.</p>
      )}
    </div>
  );
}