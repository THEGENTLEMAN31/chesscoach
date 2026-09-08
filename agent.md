# Agent.md — Boussole du chantier ChessCoach V2

> Ce fichier est la feuille de route vivante de l'agent. Toutes les tâches y sont listées, cochées quand
> terminées, avec notes de pièges et commandes de test. **C'est LE document de cap.**
> Langue de travail : français (app), anglais (code/commits) au besoin.

## Mission
Refondre le POC chesscoach en **ChessCoach V2** : web app responsive multi-utilisateurs, local-first
(moteur d'échecs dans le navigateur + SQLite local), backend FastAPI/VPS de synchronisation et d'historique.
Autonomie totale jusqu'à la V2 déployable. Tests sur le compte `thegentleman31`.

## Décisions verrouillées (DA produit/technique)
- ✅ Repo : même repo `chesscoach/`, **branche `v2`**, POC intact sur `main`, data réelle (5 185 parties) conservée pour dev/test.
- ✅ Multi-utilisateur : SQLite serveur multi-tenant (colonne `user_id` sur chaque table) + SQLite-WASM local (schéma miroir → sync JSON simple ; Dexie en repli si ça complique — pas de dogme).
- ✅ Auth : **email + mot de passe + 1 pseudo chess.com** vérifié à l'inscription via PubAPI. `fastapi-users` (OSS) + JWT cookie httpOnly + argon2 + rate-limiting + **vérification email** via service transactional (Resend).
- ✅ Moteur : **stockfish.js WASM (lite single-threaded, v18)** dans un `EngineWorker` dédié (échangeable). Moteur natif SF18 conservé côté serveur pour le batch historique. MultiPV pour les variantes.
- ✅ PWA installable + offline, UI **mobile-first**.
- ✅ DA : minimaliste — fond noir profond, éléments blancs/gris, **layout Bento**, espacement généreux, **1 accent discret**, thème clair au toggle, mode sombre par défaut.
- ✅ Stack UI : React 18 + TS + Vite · **Tailwind v4** · **shadcn/ui** · **Bklit UI** (charts, remplace recharts) · chess.js v1 · react-chessboard · react-markdown · TanStack Query · Zustand.
- ✅ Réemploi du moteur d'analyse POC : eval.py, concepts.py, openings.py, pgn.py, profile.py, digest.py, data_service.py, chesscom.py, sync/manager. Portage TS des algos eval/classif dans `shared/` pour résultats identiques navigateur/serveur.
- ✅ Page **Coach** supprimée (backend agent dormant).
- ✅ Entraînement v1 = **puzzles de MES parties** uniquement (gaffes/erreurs/imprécisions/occasions manquées ; filtres format/couleur/gravité/concept/phase/période/résultat ; rotation espacée + suivi par concept). **Lichess → v2**.
- ✅ OAuth chess.com : plus tard.
- ✅ Déploiement VPS : docker-compose (api + analyzer + web), SQLite (pas Postgres), pas de sur-ingénierie.
- ✅ Utiliser les bibliothèques OSS existantes au lieu de réécrire des choses connues.

## Architecture cible
```
Navigateur (PWA React)          VPS
├ EngineWorker (StockfishWASM)  FastAPI
├ SQLite local (wa/sql.js)      ├ auth (fastapi-users) + vérif email
├ import instantané URL/PGN     ├ sync: accept analyse client (upsert user_id+game_id+ply)
└ sync queue                    ├ sync chess.com archives (batch SF18 natif)
                                ├ profil/progression/digest (réutilisés)
                                └ analyzer (SF18 natif) — batch historique
```

## Roadmap & avancement
### Phase 0 — Fondations & auth
- [x] Branch `v2` + historique migré + snapshot POC commité
- [x] `agent.md` initialisé (ce fichier)
- [ ] Monorepo : structure `web/`, `api/`, `analyzer/`, `shared/` (types + algos eval/classif)
- [ ] Backend refactoré : routers par domaine, multi-tenant `user_id`, migrations versionnées
- [ ] Auth complète : register (vérif pseudo chess.com + email), login/refresh/logout, cookie httpOnly
- [ ] Design system Tailwind v4 + shadcn/ui + Bklit, PWA shell, DA noir/bento/1 accent, thème clair/sombre
- [ ] Suppression page Coach (route/composant) + corrections bugs connus (`CLASS_LABEL[concept]`, targets hardcodées, username hardcodé → session user)

### Phase 1 — Cœur local-first
- [ ] `EngineWorker` stockfish.js WASM : analyse incrémentale, barre d'avantage temps réel, MultiPV, profondeur adaptée device
- [ ] SQLite local (schéma miroir serveur) + module d'analyse partagé `shared/` (portage eval/concepts en TS)
- [ ] Import instantané partie : URL chess.com (`pub/game/{user}/{id}`) ou PGN → analyse locale → stockage local → file de sync
- [ ] Vérification de solution par le Worker (check_solution porté côté client)

### Phase 2 — Backend serveur (VPS)
- [ ] Endpoints import/sync des analyses client, validés Pydantic, scoping par session (`user_id`)
- [ ] Batch d'analyse historique conservé (archive chess.com, depth 16–18, dédup)
- [ ] Profil/progression/digest opérationnels multi-tenant
- [ ] (v2 only) service puzzles lichess — PAS avant la v1

### Phase 3 — Refonte pages
- [ ] **Entraînement (priorité max)** : puzzles de mes parties + filtres complets + rotation espacée + suivi par concept + indicateur de réussite
- [ ] Dashboard : digest de la semaine mis en avant, KPIs essentiels (elo/format, précision 30j, pires ouvertures, etc.), CTA « Analyser ma dernière partie », 5 dernières parties — style bento
- [ ] Parties : groupées par jour, cartes compactes (adversaire/résultat/format/précision/badge gaffes/variation elo), ouverture/date repliées au tap, filtres format/statut/résultat/ouverture
- [ ] Revue : barre d'avantage, panneau variantes, modes Rapide/Approfondi, taxonomie réelle (Brillant !! / Superbe ! / Meilleur ★ / Excellent !? / Bon / Imprécision ?! / Erreur ? / Occasion manquée / Gaffe ??)
- [ ] Progression : 1 courbe lisse (sans points) Rapid+Blitz, légende, sélecteur période, panneau améliorations/régressions
- [ ] Profil : conservation du contenu, polish mobile + fixes bugs

### Phase 4 — PWA & déploiement
- [ ] PWA offline (lecture des données en cache), multi-appareils via sync
- [ ] Déploiement VPS docker-compose (api + analyzer + web) + backup SQLite
- [ ] Validation visuelle + go production

## Plan de refactor backend (P0) — constat d'exploration
> Conclu le 07/09 pendant la phase 0. Source de vérité : code lu (db.py, main.py, config.py, schemas.py,
> chesscom.py, services/{manager,sync}.py, agent/{data_service,profile,digest}.py, eval.py, concepts.py,
> openings.py, pgn.py, analysis_client.py, engine.py, docker-compose.yml).

**Constat clé** : les pseudos chess.com sont globalement uniques → si `users.chesscom_username` est UNIQUE et
dérivé de la session (jamais du client), la colonne `username` existante scope déjà les données. **Pas besoin
de colonnes `user_id` partout ni de migration lourde des 320k plis** (pas de sur-ingénierie). Trust boundary =
tout endpoint remplace son paramètre `username` par `current_user.chesscom_username`.

Schéma multi-tenant minimal :
- Table `users` gérée par fastapi-users (adapter SQLAlchemy async → moteur `sqlite+aiosqlite` sur le même
  fichier, coexistence avec l'aiosqlite brut OK en WAL). Colonge `chesscom_username TEXT NOT NULL UNIQUE`.
- Migration v6 : créer `users` (si absent — table SQLAlchemy) ; commerce/backfill : à l'init, s'il existe des
  parties `username='thegentleman31'` et aucun `users` → auto-créer un compte admin `thegentleman31` (mot de
  passe via env `SEED_ADMIN_PASSWORD`, défaut interdit en prod) puis rien d'autre à migrer (schema data inchangé).
- `sync_runs` / `studied_positions` restent scopés par le pseudo (unique). `players` = pseudos analysés, inchangé.

Routage (refactor de `main.py`, 463 lignes mono-routage) :
- `routers/auth.py` : router fastapi-users (cookie transport JWT httpOnly, argon2) + hook vérif pseudo chess.com
  (appel `chesscom.get_player(pseudo)` à l'inscription : le pseudo doit exister sur chess.com). Resend pour vérif email.
- `routers/games.py` (+`/pgn`), `routers/stats.py`, `routers/profile.py`, `routers/sync.py`, `routers/training.py`
  (ex-/api/exercices,/api/moves,/api/etudes → futur Entraînement puzzles), `routers/digest.py`.
- `main.py` : projection légère, dépendance `CurrentUser` (fastapi-users `current_user`), lance workers.

Suppressions (Coach/LLM) : routes `/api/chat*`, `/api/digest/generate` quand LLM off ? → digest conservé pour le
Dashboard mais sans LLM (gabarit déterministe seulement) ; agent/{graph,memory,tools,quota}.py = code mort DONC
resté en place mais inclus dans rien ; `digests`/`llm_usage`/`coach_memory` utilisés par digest/usage → digest garde
`digests`, les autres dorment. Chat frontend supprimé.

Endpoints scoping : `list_games`, `stats`, `profile*`, `moves`, `exercices`, `etudes*` lisent `current_user`;
`POST /api/sync` utilisera `current_user` (username non accepté du client) ; `GET /api/sync/status` idem.
Session requise partout (sauf health + auth). `sync_runs.username` alimenté depuis le pseudo de session.

À vérifier sinon : le worker/autosync démarre par pseudo de session au login (pas de `settings.coach_username`
global sauf pour l'admin/seed).

## Commandes de dev / test
> Node est dans `/home/gentleman31/node/bin` (v22.16) — pas sur le PATH système.
> Python 3.13.5 système. Docker + compose disponibles. Pas de sudo sans mot de passe.

- Frontend dev : `PATH=/home/gentleman31/node/bin:$PATH npm run dev` (dans `web/`)
- Backend dev : `uvicorn app.main:app --port 8001` (dans `api/`, venv `.venv`)
- Analyzer dev : `uvicorn app.main:app --port 8002` (dans `analyzer/`)
- Assertions santé : `python3 - <<'PY' ... PY` / sqlite via python (pas de binaire sqlite3)
- Vérif data : `POST http://localhost:8001/api/sync` etc.

## Pièges rencontrés (à retenir)
- `.git/objects` d'origine appartenait à `root` (anciens builds Docker) → **nouveau dépôt git initialisé**, historique récupéré depuis `.git-poc-archive/` (archive conservée, gitignorée). Ne pas supprimer tant que le dépôt n'est pas poussé.
- Pas de binaire `sqlite3` sur le système → utiliser python `sqlite3` en lecture-ro (`file:...?mode=ro`).
- L'API chess.com PubAPI : refresh max 12 h, 429 sur requêtes parallèles, séries OK → sérialiser les appels, `User-Agent` propre.
- La data `data/chesscoach.db` (191 Mo, 320k plis) est le jeu de test principal — ne jamais la supprimer/corrompre (migrations versionnées uniquement).