import { Card } from "../components/ui";

export default function Progression() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Progression</h1>
      <Card>
        <p className="text-sm text-muted">
          Courbes d'elo, précision et erreurs au fil du temps — déployées au
          prochain passage.
        </p>
      </Card>
    </div>
  );
}