import { Link, useParams } from "react-router-dom";
import { Card } from "../components/ui";
import { ChevronRightIcon } from "../components/icons";

export default function GameReview() {
  const { id } = useParams();
  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/games"
        className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" />
        Retour aux parties
      </Link>
      <Card>
        <h1 className="text-xl font-semibold tracking-tight">
          Partie {id ? `#${id}` : ""}
        </h1>
        <p className="mt-2 text-sm text-muted">
          La relecture interactive (échiquier, fautes, analyses) sera portée au
          prochain passage.
        </p>
      </Card>
    </div>
  );
}