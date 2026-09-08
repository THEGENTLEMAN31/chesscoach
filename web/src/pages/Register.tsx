import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { api, ApiError } from "../lib/api";

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pseudo, setPseudo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.register(email.trim(), password, pseudo.trim());
      navigate("/login", {
        replace: true,
        state: { registered: true },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Inscription impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Créer un compte</h1>
          <p className="mt-1 text-sm text-muted">
            Ton pseudo chess.com doit exister : c'est là que toutes tes parties
            sont analysées.
          </p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Pseudo chess.com</span>
            <input
              type="text"
              required
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              placeholder="thegentleman31"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
            />
          </label>
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Vérification…" : "S'inscrire"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-muted">
          Déjà inscrit ?{" "}
          <Link to="/login" className="text-accent hover:underline">
            Se connecter
          </Link>
        </p>
      </Card>
    </div>
  );
}