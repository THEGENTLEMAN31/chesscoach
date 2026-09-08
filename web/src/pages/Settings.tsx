import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { MoonIcon, SunIcon } from "../components/icons";
import { currentTheme, setTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { useSession } from "../lib/session";
import {
  loadSettings,
  saveSettings,
  type EvalDisplay,
  type Settings as GameSettings,
} from "../lib/game/settings";

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 text-left"
    >
      <span>
        <span className="block text-sm text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-accent" : "bg-surface-3"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink/80 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

export default function Settings() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState<Theme>(currentTheme());
  const [game, setGame] = useState<GameSettings>(loadSettings);

  const patchGame = (p: Partial<GameSettings>) => {
    const next = { ...game, ...p };
    setGame(next);
    saveSettings(next);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const logout = async () => {
    const { logout } = useSession.getState();
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Réglages</h1>

      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Compte</div>
          <div className="mt-0.5 text-xs text-muted">
            {user?.email} · {user?.chesscom_username}
          </div>
        </div>
      </Card>

      <Card className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {theme === "dark" ? (
            <MoonIcon className="h-4 w-4 text-muted" />
          ) : (
            <SunIcon className="h-4 w-4 text-muted" />
          )}
          <span className="text-sm">Thème clair</span>
        </div>
        <button
          role="switch"
          aria-checked={theme === "light"}
          onClick={toggleTheme}
          className={`relative h-6 w-11 rounded-full transition-colors ${
            theme === "light" ? "bg-accent" : "bg-surface-3"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-ink/80 transition-transform ${
              theme === "light" ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </Card>

      {["clickToMove", "showLegalMoves", "showPlayedArrow", "showBestArrow", "autoNextQuiz"].map((key) => (
        <Card key={key}>
          <Toggle
            checked={game[key as keyof GameSettings] as boolean}
            onChange={(v) => patchGame({ [key]: v })}
            label={
              key === "clickToMove"
                ? "Clic pour jouer"
                : key === "showLegalMoves"
                  ? "Montrer les coups légaux"
                  : key === "showPlayedArrow"
                    ? "Flèche du coup joué"
                    : key === "showBestArrow"
                      ? "Flèche du meilleur coup"
                      : "Enchaîner les exercices"
            }
            hint={
              key === "clickToMove"
                ? "Cliquer une pièce puis la case d'arrivée (sinon, glisser-déposer)."
                : key === "showLegalMoves"
                  ? "Afficher les cases d'arrivée possibles sur l'échiquier."
                  : key === "showPlayedArrow"
                    ? "Sur l'échiquier, montrer la flèche du coup réellement joué."
                    : key === "showBestArrow"
                      ? "Montrer la flèche du meilleur coup calculé par le moteur."
                      : "Passer automatiquement au coup suivant après révélation."
            }
          />
        </Card>
      ))}

      <Card>
        <span className="block text-sm text-ink">Affichage des pertes</span>
        <span className="mt-0.5 block text-xs text-muted">
          En pions (CPL) ou en points de probabilité de gain.
        </span>
        <div className="mt-3 flex items-center gap-1 rounded-lg border border-line bg-surface-3/50 p-1">
          {(["cp", "winprob"] as EvalDisplay[]).map((mode) => (
            <button
              key={mode}
              onClick={() => patchGame({ evalDisplay: mode })}
              className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                game.evalDisplay === mode
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              {mode === "cp" ? "Pions" : "Probabilité"}
            </button>
          ))}
        </div>
      </Card>

      <Button
        variant="ghost"
        onClick={() => void logout()}
        className="justify-start text-red-400 hover:bg-surface-3"
      >
        Se déconnecter
      </Button>
    </div>
  );
}