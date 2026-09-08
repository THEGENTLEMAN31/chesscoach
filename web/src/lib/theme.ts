const KEY = "chesscoach:theme";

export type Theme = "dark" | "light";

function apply(t: Theme): void {
  document.documentElement.dataset.theme = t;
}

export function initTheme(): void {
  const saved = localStorage.getItem(KEY);
  apply(saved === "light" ? "light" : "dark");
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setTheme(t: Theme): void {
  apply(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* stockage indisponible : on ignore */
  }
}