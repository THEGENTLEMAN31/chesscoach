import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSession } from "../lib/session";
import { currentTheme, setTheme } from "../lib/theme";
import {
  ChartIcon,
  GridIcon,
  KnightIcon,
  ListIcon,
  LogoutIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  TargetIcon,
  UserIcon,
} from "./icons";

const NAV = [
  { to: "/dashboard", label: "Tableaux", icon: GridIcon },
  { to: "/games", label: "Parties", icon: ListIcon },
  { to: "/training", label: "Entraînement", icon: TargetIcon },
  { to: "/progression", label: "Progression", icon: ChartIcon },
  { to: "/profile", label: "Profil", icon: UserIcon },
];

export default function Layout() {
  const { user, logout } = useSession();
  const location = useLocation();
  const [theme, setThemeState] = useState(currentTheme());

  const current = NAV.find((n) => location.pathname.startsWith(n.to));

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  const navItem = (cls: string) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${cls}`;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-line bg-surface-2 p-4 md:flex">
        <div className="flex items-center gap-2.5 px-2 py-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <KnightIcon className="h-5 w-5" />
          </div>
          <span className="text-base font-semibold tracking-tight">ChessCoach</span>
        </div>
        <nav className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                navItem(
                  isActive
                    ? "bg-surface-3 text-ink"
                    : "text-muted hover:bg-surface-3/60 hover:text-ink",
                )
              }
            >
              <Icon className="h-4.5 w-4.5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              navItem(
                isActive
                  ? "bg-surface-3 text-ink"
                  : "text-muted hover:bg-surface-3/60 hover:text-ink",
              )
            }
          >
            <SettingsIcon className="h-4.5 w-4.5" />
            Réglages
          </NavLink>
          <div className="flex items-center gap-2 px-3 py-2">
            <div className="flex h-6 min-w-6 items-center justify-center rounded-full bg-surface-3 px-1.5 text-xs font-medium text-muted">
              {user?.chesscom_username.slice(0, 1).toUpperCase()}
            </div>
            <span className="truncate text-sm text-muted">
              {user?.chesscom_username}
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col md:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-line bg-surface/80 px-4 backdrop-blur">
          <div className="flex items-center gap-2.5 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink">
              <KnightIcon className="h-4.5 w-4.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">ChessCoach</span>
          </div>
          <h1 className="hidden text-sm font-medium text-muted md:block">
            {current?.label ?? "ChessCoach"}
          </h1>
          <div className="flex items-center gap-1.5">
            <NavLink
              to="/settings"
              aria-label="Réglages"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted md:hidden transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <SettingsIcon className="h-4.5 w-4.5" />
            </NavLink>
            <button
              onClick={toggleTheme}
              aria-label="Basculer le thème"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink md:h-8 md:w-8"
            >
              {theme === "dark" ? <SunIcon className="h-4.5 w-4.5" /> : <MoonIcon className="h-4.5 w-4.5" />}
            </button>
            <button
              onClick={() => void logout()}
              aria-label="Déconnexion"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-3 hover:text-ink md:h-8 md:w-8"
            >
              <LogoutIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-10">
          <Outlet />
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface-2 pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-accent" : "text-muted"
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}