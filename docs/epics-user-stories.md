# ChessCoach — Epics & User Stories

> Référentiel produit/maintenance. Cette page reflète les cas d'usage réels
> (retours utilisateur) et doit rester à jour avec les décisions de `agent.md`.
> Légende : ✅ fait (prod) · 🔶 en cours/partiel · ☐ à faire.

## Epic 1 — Progression parlante
**Objectif** : comprendre d'un coup d'œil comment le niveau évolue, sans deviner.

- US 1.1 — ✅ Afficher les axes ordonnées (dates mois/année) et abscisses (elo) sur le graphe.
- US 1.2 — ✅ Montrer les **paliers** : les semaines/mois sans jeu doivent être visibles
  (pas une droite décendante trompeuse) — courbe en escalier.
- US 1.3 — ✅ Superposer les deux courbes **rapid + blitz** bien légendées sur « Toutes cadences ».
- US 1.4 — ✅ Filtrer la période (date début → fin) et la plage elo (min/max).
- US 1.5 — ✅ Afficher départ / actuel / max / min en clair (sans survol).
- US 1.6 — ☐ Tooltip au survol avec date exacte + elo à chaque point.
- US 1.7 — ☐ Indiquer les « trous » (pauses) avec une frise sous le graphe.

## Epic 2 — Explorateur libre
**Objectif** : pouvoir essayer n'importe quoi sur un échiquier et voir l'éval du moteur.

- US 2.1 — ✅ Lister tous les coups légaux de la position avec éval du moteur (cp + delta + proba).
- US 2.2 — ✅ Trier par éval ou proba, cliquer « Jouer » pour appliquer le coup.
- US 2.3 — ✅ Exploration libre existante : déplacer les pièces, revenir à la partie.
- US 2.4 — ☐ Marquer les coups « meilleurs » (ceux que le moteur suggère) vs les essais utiles.
- US 2.5 — ☐ Sauvegarder une variante explorée (repriser la variante pour la retrouver).

## Epic 3 — Entraînement utile
**Objectif** : progresser sur ses vrais défauts, pas des cas génériques.

- US 3.1 — ✅ Exercices depuis ses blunders/gaffes, rotation par réussite/échec.
- US 3.2 — ✅ Filtre concept par chips compactes (plus de <select> plein écran).
- US 3.3 — ✅ « Suite de la partie » : rejouer une séquence multi-coups (line), plus un seul coup.
- US 3.4 — ☐ Rotation espacée (réespacer un concept acquis, proposer avant oubli).
- US 3.5 — ☐ Filtres cadence (rapid/blitz) et gravité (perte) sur les exercices.

## Epic 4 — Lectures de partie
**Objectif** : revue claire et sans surcharge.

- US 4.1 — ✅ Jauge d'éval verticale à droite de l'échiquier (monte/descend).
- US 4.2 — ✅ Typologie chess.com (Coup optimal, Bon, Imprécision, Erreur, Gaffe, Théorique).
- US 4.3 — ✅ Courbe d'éval en bas de revue (probabilité) SANS cercles/markers sur chaque point.
- US 4.4 — ✅ Flèches joué / meilleur coup paramétrables (Réglages).
- US 4.5 — ☐ Panneau MultiPV (variantes du moteur : 2-3 meilleurs coups) en revue.
- US 4.6 — ☐ Groupement de la liste de coups par phase / jour.

## Epic 5 — Multi-utilisateurs
- US 5.1 — ✅ Créer un compte avec son pseudo chess.com vérifié (PubAPI).
- US 5.2 — ✅ Charger automatiquement sa data à l'inscription (sync auto en fond).
- US 5.3 — ✅ Isolation stricte par pseudo (chaque user ne voit que ses données).
- US 5.4 — ✅ Admin (thegentleman31) inchangé, prioritaire.
- US 5.5 — ☐ Objectif personnel modifiable par l'utilisateur (endpoint dédié).

## Epic 6 — Local-first & sync
- US 6.1 — ✅ Import PGN/URL → analyse WASM dans le navigateur → stockage local.
- US 6.2 — ✅ file sync_queue drainée au retour réseau (autoSync) + bouton manuel.
- US 6.3 — ✅ plis envoyés 1-based cohérents, acpl/accuracy calculés serveur.
- US 6.4 — ☐ E2E intégré au repo, healthcheck, monitoring.

## Epic 7 — Interface générale
- US 7.1 — ✅ Nav 5 items max, Réglages accessible sur mobile.
- US 7.2 — ✅ Contraste text-muted lisible (lié à muted-foreground).
- US 7.3 — ✅ Responsive mobile/tablette/desktop (grid + bottom bar mobile).
- US 7.4 — ✅ High paramétrabilité (Réglages : clic/glisser, flèches, enchaîner).