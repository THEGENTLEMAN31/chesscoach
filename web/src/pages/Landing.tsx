import { Link } from "react-router-dom";
import { LogoMark } from "../components/Logo";
import { ChevronRightIcon } from "../components/icons";
import { Board } from "../components/Board";
import EvalBar from "../components/EvalBar";
import type { Arrow } from "react-chessboard/dist/chessboard/types";

function MiniBoard({
  fen,
  arrows,
  orientation = "black",
}: {
  fen: string;
  arrows?: Arrow[];
  orientation?: "white" | "black";
}) {
  return (
    <div className="w-full">
      <Board
        fen={fen}
        orientation={orientation}
        draggable={false}
        arrows={arrows}
        className="aspect-square"
      />
    </div>
  );
}

const BENEFITS = [
  {
    title: "Tu sais quoi travailler",
    text: "Fini les puzzles génériques. Chaque exercice vient d'une position que tu as réellement jouée.",
  },
  {
    title: "Tu progresses sur tes vraies erreurs",
    text: "Tes gaffes, erreurs et occasions manquées deviennent des exercices de 5 minutes, classés par concept.",
  },
  {
    title: "Une progression honnête, sans pression",
    text: "Le juge est Stockfish, pas un LLM qui invente. Pas de série à maintenir, pas de relance culpabilisante.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Importe tes parties",
    text: "Ton pseudo chess.com suffit. Les dernières parties, ou tout ton historique.",
  },
  {
    n: "2",
    title: "Comprends tes erreurs",
    text: "Le moteur classe chaque coup. Tu vois les positions qui te coûtent le plus de points.",
  },
  {
    n: "3",
    title: "Travaille les bonnes positions",
    text: "Chaque erreur récurrente devient un exercice tiré de ta propre partie, jusqu'à ce qu'elle disparaisse.",
  },
];

const FAQ = [
  {
    q: "C'est vraiment gratuit ?",
    a: "Oui. Le moteur tourne sur ton appareil, donc le coût marginal est proche de zéro. Pas de version premium cachée.",
  },
  {
    q: "Je dois quitter chess.com ?",
    a: "Non. On lit tes parties publiques chess.com. Tu continues à jouer où tu veux.",
  },
  {
    q: "Où sont mes données ?",
    a: "L'analyse tourne en local quand c'est possible. Tes données ne sont ni revendues ni utilisées pour la publicité.",
  },
  {
    q: "Pourquoi pas un LLM pour l'analyse ?",
    a: "Parce qu'un LLM peut inventer une évaluation. Stockfish donne la même réponse pour la même position, toujours.",
  },
  {
    q: "Et si je ne joue pas pendant deux semaines ?",
    a: "Rien ne se perd. Aucune série à réparer, aucune relance culpabilisante.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-dvh bg-surface text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <LogoMark className="h-5 w-5" />
            </span>
            <span className="text-base font-semibold tracking-tight">Cavalel</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#comment" className="transition-colors hover:text-ink">Comment ça marche</a>
            <a href="#gratuit" className="transition-colors hover:text-ink">Gratuit</a>
            <a href="#faq" className="transition-colors hover:text-ink">FAQ</a>
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-3 hover:text-ink sm:inline-flex"
            >
              Se connecter
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-ink transition-opacity hover:opacity-90 sm:px-3.5"
            >
              <span className="sm:hidden">Commencer</span>
              <span className="hidden sm:inline">Analyser mes parties</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:pt-20">
          <div className="grid items-start gap-12 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium uppercase tracking-wider text-muted">
                Coach d'échecs personnel · 1000-2000 Elo
              </p>
              <h1 className="max-w-xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
                Tes erreurs deviennent ton plan de progression.
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
                Cavalel analyse tes parties chess.com, repère les erreurs qui se
                répètent et les transforme en exercices. Tu sais enfin quoi
                travailler, pourquoi, et si ça paie.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
                >
                  Analyser mes parties chess.com
                  <ChevronRightIcon className="h-4 w-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center rounded-lg border border-line-strong px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-surface-3"
                >
                  Voir une analyse d'exemple
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted">
                1 minute. Gratuit. Ton pseudo chess.com suffit. Aucune carte bancaire.
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Issu de tes parties
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> 5 min par session
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden /> Analyse locale
                </li>
              </ul>
            </div>

            {/* Visuel avant / après */}
            <div className="relative">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="rounded-2xl border border-line bg-surface-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">Ta partie</span>
                    <span className="rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-[11px] font-semibold text-danger">
                      Gaffe · −7,3 pions
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-center gap-3">
                    <div className="w-[240px] shrink-0">
                      <MiniBoard
                        fen="7k/1pp3p1/p1n4p/8/1q2Q3/5N1P/1PP2PP1/6K1 w - - 0 27"
                        orientation="white"
                        arrows={[["f3", "h4", "var(--color-danger)"]]}
                      />
                    </div>
                    <EvalBar cp={-734} height={240} label="−7,3" />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Tu avais joué <b className="text-ink">Nh4</b> (gaffe, <b className="text-danger">−7,3 pions</b>). Le coup du moteur était <b className="text-accent">Qe8+</b>.
                  </p>
                </div>
                <div className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted">Ton exercice</span>
                    <span className="rounded-md border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      À toi de jouer
                    </span>
                  </div>
                  <div className="mt-3 flex items-start justify-center gap-3">
                    <div className="w-[240px] shrink-0">
                      <MiniBoard
                        fen="7k/1pp3p1/p1n4p/8/1q2Q3/5N1P/1PP2PP1/6K1 w - - 0 27"
                        orientation="white"
                        arrows={[["e4", "e8", "var(--color-accent)"]]}
                      />
                    </div>
                    <EvalBar cp={0} height={240} label="0.0" />
                  </div>
                  <p className="mt-3 text-xs text-muted">
                    Position réelle de ta partie (blitz, 27e coup). Trouve le coup du moteur : <b className="text-ink">Qe8+</b> plutôt que la gaffe <b className="text-danger">Nh4</b> (−7,3 pions).
                  </p>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-12 rounded-xl border border-line bg-surface-2 px-4 py-3 text-center text-xs text-muted">
            Stockfish · analyse sur ton appareil · tes parties restent chez toi · 0 €.
            Pas de faux témoignages, que des faits vérifiables.
          </p>
        </section>

        {/* Comment */}
        <section id="comment" className="border-t border-line bg-surface-2/40">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Comment ça marche</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Trois étapes, une minute. Aucun réglage à comprendre.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-line bg-surface p-5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold text-accent">
                    {s.n}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bénéfices */}
        <section id="gratuit" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-semibold tracking-tight">Ce qui change vraiment</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {BENEFITS.map((b) => (
              <div key={b.title} className="rounded-2xl border border-line bg-surface-2 p-5">
                <h3 className="text-sm font-semibold text-ink">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{b.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-line bg-surface-2 p-5">
            <h3 className="text-sm font-semibold">Gratuit, pour de vrai</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Toutes les fonctions importantes restent gratuites : analyse, revue,
              exercices, profil, progression, objectifs Elo. Le moteur tourne chez
              toi, donc le coût marginal est proche de zéro. Pas de paywall caché,
              pas de publicité, pas de revente de données.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-line bg-surface-2/40">
          <div className="mx-auto max-w-3xl px-4 py-16">
            <h2 className="text-2xl font-semibold tracking-tight">Questions fréquentes</h2>
            <div className="mt-6 flex flex-col gap-2">
              {FAQ.map((f) => (
                <details
                  key={f.q}
                  className="group rounded-xl border border-line bg-surface px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink">
                    {f.q}
                    <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90" />
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="rounded-2xl border border-accent/30 bg-accent-soft p-8 text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              Prêt à voir ce que tes parties disent de ton jeu ?
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted">
              Analyser, comprendre, s'entraîner. Sans pression, sans quitter chess.com.
            </p>
            <Link
              to="/register"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-accent-ink transition-opacity hover:opacity-90"
            >
              Analyser mes parties chess.com
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
            <p className="mt-3 text-xs text-muted">Gratuit, sans carte bancaire.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted sm:flex-row">
          <span className="flex items-center gap-2">
            <LogoMark className="h-4 w-4 text-accent" />
            Cavalel · coach d'échecs personnel
          </span>
          <span>Non affilié à Chess.com · Stockfish (GPLv3)</span>
        </div>
      </footer>
    </div>
  );
}
