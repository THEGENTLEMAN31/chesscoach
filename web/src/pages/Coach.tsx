import { useParams } from "react-router-dom";
import Chat from "../components/Chat";

export default function Coach() {
  const { thread } = useParams();
  const threadId = thread ?? "default";
  return (
    <div className="card coach-page">
      <h2>Coach (agent LangGraph)</h2>
      <p className="muted">
        Un agent unique, intelligent, outillé : il consulte tes parties analysées,
        les stats, le répertoire, génère des exercices et garde la mémoire de tes
        progrès. Il ne fabrique jamais une évaluation : tout vient de Stockfish.
      </p>
      <Chat
        threadId={threadId}
        placeholder="Exemples : « analyse ma dernière défaite », « quelles sont mes bévues récurrentes ? », « donne-moi un exercice », « et si j'avais joué X ? »"
      />
    </div>
  );
}
