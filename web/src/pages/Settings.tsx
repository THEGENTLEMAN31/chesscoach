import { useEffect, useState } from "react";
import { loadSettings, saveSettings, type EvalDisplay, type Settings } from "../settings";

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className="switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="slider" />
      </span>
    </label>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const set = (patch: Partial<Settings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className="settings-page">
      <div className="card">
        <h2>Paramètres</h2>
        <p className="muted">
          Préférences d'interaction sur les échiquiers (entraînement et revue).
        </p>
      </div>
      <div className="card">
        <Toggle
          label="Déplacement par clic (façon Lichess)"
          hint="Clique une pièce : ses coups possibles s'affichent en pointillés, puis clique la case d'arrivée. Le glisser-déposer reste disponible."
          checked={settings.clickToMove}
          onChange={(v) => set({ clickToMove: v })}
        />
        <Toggle
          label="Indiquer les coups possibles"
          hint="Affiche les petits pointillés sur les cases accessibles quand une pièce est sélectionnée."
          checked={settings.showLegalMoves}
          onChange={(v) => set({ showLegalMoves: v })}
        />
      </div>
      <div className="card">
        <h3>Perte d'un coup</h3>
        <p className="muted">
          Comment exprimer le coût d'une bévue sur l'échiquier (entraînement et revue).
        </p>
        <div className="segmented">
          {(
            [
              ["cp", "En pions (+2.4)"],
              ["winprob", "Probabilité (65%)"],
            ] as [EvalDisplay, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={settings.evalDisplay === value ? "active" : ""}
              onClick={() => set({ evalDisplay: value })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
