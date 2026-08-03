export type EvalDisplay = "cp" | "winprob";

export interface Settings {
  clickToMove: boolean;
  showLegalMoves: boolean;
  evalDisplay: EvalDisplay;
}

const KEY = "chesscoach:settings";
const DEFAULTS: Settings = {
  clickToMove: true,
  showLegalMoves: true,
  evalDisplay: "cp",
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
