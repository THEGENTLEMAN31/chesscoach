import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { MoonIcon, SunIcon } from "../components/icons";
import { currentTheme, setTheme } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { useSession } from "../lib/session";

export default function Settings() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [theme, setThemeState] = useState<Theme>(currentTheme());

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