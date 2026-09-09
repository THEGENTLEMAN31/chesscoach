import { createContext, useCallback, useContext, useState } from "react";

type Kind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: Kind;
  message: string;
}

interface ToastApi {
  push: (kind: Kind, message: string) => void;
}

const ToastCtx = createContext<ToastApi>({ push: () => {} });

export const useToast = () => useContext(ToastCtx);

let seq = 1;

const DOT: Record<Kind, string> = {
  success: "bg-emerald-500",
  error: "bg-[#d9534f]",
  info: "bg-accent",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Kind, message: string) => {
    const id = seq++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3800);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-line bg-surface-2/95 px-3.5 py-2.5 text-sm text-ink shadow-lg backdrop-blur"
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[t.kind]}`} />
            <span className="min-w-0">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}