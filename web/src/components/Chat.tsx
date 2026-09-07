import { useEffect, useRef, useState } from "react";
import Markdown from "./Markdown";

interface Msg {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

interface Props {
  threadId: string;
  placeholder?: string;
}

export default function Chat({ threadId, placeholder }: Props) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<null | boolean>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/chat/status")
      .then((r) => r.json())
      .then((d) => setEnabled(d.enabled))
      .catch(() => setEnabled(false));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setBusy(true);
    setMessages((m) => [...m, { role: "assistant", text: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, thread_id: threadId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            text: (data as { text?: string }).text ?? "(réponse vide)",
          };
          return copy;
        });
        return;
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantText = "";

      const handleEvent = (event: string, data: string) => {
        if (event === "token") {
          assistantText += data;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", text: assistantText };
            return copy;
          });
        } else if (event === "error") {
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = {
              role: "assistant",
              text: "Erreur : " + data,
              error: true,
            };
            return copy;
          });
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const frames = buf.split("\n\n");
        buf = frames.pop() ?? "";
        for (const frame of frames) {
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (data) handleEvent(event, data);
        }
      }
      if (assistantText === "") {
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            text: "(réponse vide)",
            error: true,
          };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          text: "Échec de la connexion au coach : " + String(e),
          error: true,
        };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-messages">
        {enabled === false && (
          <div className="chat-warn">
            Le coach LLM n'est pas activé sur le serveur (LLM_ENABLED=false).
          </div>
        )}
        {messages.length === 0 && (
          <div className="chat-empty">
            {placeholder ??
              "Demande-moi un résumé de tes parties, une analyse de tes bévues récurrentes, des exercices, ou « et si j'avais joué autre chose ? »"}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`msg ${m.role} ${m.error ? "msg-error" : ""}`}>
            <Markdown text={m.text} />
          </div>
        ))}
        {busy && messages[messages.length - 1]?.text === "" && (
          <div className="msg assistant">
            <span className="dots">…</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Pose ta question au coach…"
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>
          Envoyer
        </button>
      </div>
    </div>
  );
}
