export type EvalDisplay = "cp" | "winprob";

export type BoardThemeId =
  | "auto"
  | "walnut"
  | "moss"
  | "ocean"
  | "sand"
  | "midnight"
  | "graphite"
  | "custom";

export type AccentId = "blue" | "teal" | "violet" | "amber" | "rose" | "custom";

export interface Settings {
  clickToMove: boolean;
  showLegalMoves: boolean;
  evalDisplay: EvalDisplay;
  showPlayedArrow: boolean;
  showBestArrow: boolean;
  autoNextQuiz: boolean;
  boardTheme: BoardThemeId;
  boardLight: string;
  boardDark: string;
  accent: AccentId;
  accentCustom: string;
}

export interface BoardPreset {
  label: string;
  light: string;
  dark: string;
}

export interface AccentPreset {
  label: string;
  dark: string;
  light: string;
}

export const BOARD_THEMES: Record<
  Exclude<BoardThemeId, "auto" | "custom">,
  BoardPreset
> = {
  walnut: { label: "Noyer", light: "#f0d9b5", dark: "#b58863" },
  moss: { label: "Mousse", light: "#ebecd0", dark: "#739552" },
  ocean: { label: "Océan", light: "#dce8f2", dark: "#7fa3c0" },
  sand: { label: "Sable", light: "#f5e7c8", dark: "#c9a97a" },
  midnight: { label: "Minuit", light: "#9aa7b2", dark: "#5c6975" },
  graphite: { label: "Graphite", light: "#b9c2cb", dark: "#6b7784" },
};

export const ACCENTS: Record<Exclude<AccentId, "custom">, AccentPreset> = {
  blue: { label: "Bleu", dark: "#6fa8dc", light: "#2c6fa8" },
  teal: { label: "Turquoise", dark: "#4fd1c5", light: "#0f766e" },
  violet: { label: "Violet", dark: "#b197fc", light: "#6d4ac4" },
  amber: { label: "Ambre", dark: "#e3b341", light: "#946200" },
  rose: { label: "Rose", dark: "#f78da7", light: "#b23a5b" },
};

const KEY = "chesscoach:settings";

const DEFAULTS: Settings = {
  clickToMove: true,
  showLegalMoves: true,
  evalDisplay: "cp",
  showPlayedArrow: true,
  showBestArrow: true,
  autoNextQuiz: false,
  boardTheme: "auto",
  boardLight: "#f0d9b5",
  boardDark: "#b58863",
  accent: "blue",
  accentCustom: "#6fa8dc",
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* stockage indisponible : on ignore */
  }
}

function hexLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function currentTheme(): "dark" | "light" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Applique les préférences visuelles (échiquier + accent) sur :root. */
export function applyPersonalization(s: Settings = loadSettings()): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = currentTheme();

  // Échiquier
  let light = s.boardLight;
  let dark = s.boardDark;
  if (s.boardTheme === "auto") {
    const preset = BOARD_THEMES[theme === "light" ? "walnut" : "midnight"];
    light = preset.light;
    dark = preset.dark;
  } else if (s.boardTheme !== "custom") {
    const preset = BOARD_THEMES[s.boardTheme];
    if (preset) {
      light = preset.light;
      dark = preset.dark;
    }
  }
  root.style.setProperty("--board-light", light);
  root.style.setProperty("--board-dark", dark);

  // Accent
  let accent = s.accentCustom;
  if (s.accent !== "custom") {
    const preset = ACCENTS[s.accent];
    if (preset) accent = theme === "light" ? preset.light : preset.dark;
  }
  const fg = hexLuminance(accent) > 0.55 ? "#0b0e11" : "#ffffff";
  root.style.setProperty("--color-accent", accent);
  root.style.setProperty("--color-accent-ink", fg);
  root.style.setProperty("--color-accent-soft", `color-mix(in srgb, ${accent} 15%, transparent)`);
  root.style.setProperty("--ring", accent);
  root.style.setProperty("--primary", accent);
  root.style.setProperty("--primary-foreground", fg);
  root.style.setProperty("--board-select-ring", accent);
}
