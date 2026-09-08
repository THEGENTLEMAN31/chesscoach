import { Card } from "../components/ui";
import { TargetIcon } from "../components/icons";

export default function Training() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Entraînement</h1>
      <Card className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-accent">
          <TargetIcon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-medium">Puzzles de tes parties</h2>
          <p className="mt-1 text-sm text-muted">
            Les puzzles sont tirés de TES parties, pas de bases génériques. La
            surface d'entraînement complète arrive au prochain passage.
          </p>
        </div>
      </Card>
    </div>
  );
}