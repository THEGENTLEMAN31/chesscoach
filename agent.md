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
- [x] Backend refactoré : routers par domaine, multi-tenant `user_id`, migrations versionnées
- [x] Auth complète : register (vérif pseudo chess.com + email à activer), login/refresh/logout, cookie httpOnly
- [x] Design system (socle) : Tailwind v4 + DA noir profonde/bento/1 accent discret (#6fa8dc), thème clair/sombre, PWA installable (VitePWA)
- [ ] Design system (suite) : shadcn/ui + composants Bklit UI (remplacement recharts) — pas nécessaires avant la refonte des pages graphiques
- [~] Coach supprimée (route + Chat/Markdown/EvalCurve/MoveList retirés) + username hardcodé → session user (Scoping UI OK)
- [ ] Corrections restantes lors du port des pages : `CLASS_LABEL[concept]` (Revue), targets hardcodées (Profil), relecture/puzzles à porter sur le DS

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

- Backend V2 dev : `python3 -m uvicorn app.main:app --port 8010` (dans `api/`, user-site ~/.local).
  **Port 8010** : le POC occupe déjà 8001/8002 localement (processus `uvicorn app.main:app` résiduels).
  Lancer avec `setsid nohup ... </dev/null > log &` sinon le shell opencode attend le process.
- Auth test : `curl -c c.txt -X POST localhost:8010/api/auth/jwt/login -d "username=admin@chesscoach.io&password=..."`.
- Frontend dev : `PATH=/home/gentleman31/node/bin:$PATH npm run dev` (dans `web/`)
- Analyzer dev : `uvicorn app.main:app --port 8002` (dans `analyzer/`)
- Assertions santé : `python3 - <<'PY' ... PY` / sqlite via python (pas de binaire sqlite3)
- Vérif data : `POST http://localhost:8010/api/sync` etc.

## Session P0 backend — fait le 08/09 (commit 06810e8, poussé origin/v2)
- Backend refactoré : `main.py` → routers par domaine (`routers/{auth,games,stats,sync,training}.py`),
  dépendances dans `dependencies.py`, auth dans `users.py` (fastapi-users v15, cookie httpOnly JWT + argon2).
- Multi-tenant par trust boundary : `chesscom_username` UNIQUE sur `users`, dérivé de la session,
  identifie toutes les données (pas de requête client). Migration **v6** : `digests.username` (+ index).
- Inscription : pseudo chess.com vérifié via PubAPI (`get_player`) → 400 si inconnu/déjà pris,
  email vérifié à activer (`verify_email` + Resend), compte actif direct tant que désactivé.
- **Seed admin** : `SEED_ADMIN_PASSWORD/EMAIL/CHESSCOM` (idempotent) → compte admin@chesscoach.io/thegentleman31.
- `SyncManager` réécrit per-user (un run/utilisateur, batch serveur repreneur ; worker global supprimé).
- Dépendances dev : installées en **user-site ~/.local** (`--break-system-packages`, PEP 668) :
  aiosqlite, sqlalchemy, python-chess, pydantic-settings, fastapi-users[sqlalchemy], python-multipart.
  Venv impossible (pas de python3-venv, pas de sudo). `api/.env` (dev, gitignoré) : DB_PATH, JWT_SECRET, seed.
- Tests passés : login/logout cookie, 401 sans cookie, register pseudo invalide 400 / valide 201,
  doublons pseudo/email 400, scoping (hikaru→0 parties, thegentleman31→5199), stats/profile/digest/exercices scopés.

## Session web — scaffold V2 (fait le 08/09)
- Socle `web/` refondu : Vite + React 18 + TS strict + Tailwind v4 (@tailwindcss/vite) + react-router 6 +
  TanStack Query + zustand + **PWA (vite-plugin-pwa, manifest + SW precache)**. `chess.js` v1, react-chessboard 4.
- **DA** : fond noir profond, 3 niveaux de surface, 1 accent discret (`--color-accent: #6fa8dc`), thème clair/sombre
  (toggle, persisté, piloté par vars CSS via `[data-theme="light"]`), polices système (offline), mobile-first
  (bottom-nav 5 entrées, sidebar desktop), layout bento (grid).
- **Architecture** : `lib/api.ts` (client API scopé par session, cookies same-origin, `ApiError`),
  `lib/session.ts` (zustand : bootstrap `/users/me`, login/logout), `lib/types.ts` aligné sur les schémas API réels,
  composants `ui.tsx` + `icons.tsx` SVG inline (zéro emoji), `Layout.tsx` (auth guard + nav).
- **Pages** : Login/Register (UI CookieTransport), **Dashboard fonctionnel** (cadences + typologie coups + sync + digest),
  **Parties fonctionnel** (filtres format/statut, badges résultat), Profil (via `/api/profile`, recalcul),
  Réglages (thème, déco) ; placeholders Progression/Training/GameReview (port DS au prochain passage).
- **Coach supprimée** : routes `/chat*` côté backend déjà retirées ; frontend Chat/Markdown/EvalCurve/MoveList.
- Build `npm run build` OK (tsc -b + vite + PWA precache 11 entries). E2E via proxy Vite (port 4173) :
  login 204 + cookie → `/api/stats` → données réelles scopées (rapid 3017 / blitz 2172).
- **Piège node_modules** : installé root → impossible rm/mv cross-FS. Solution : **renommage même-FS** (rename syscall)
  `mkdir`dans `.poc-root` (gitignorés) puis `npm install` neuf. `npm` nécessite `PATH=/home/gentleman31/node/bin:$PATH`.

## Pièges rencontrés (à retenir)
- `.git/objects` d'origine appartenait à `root` (anciens builds Docker) → **nouveau dépôt git initialisé**, historique récupéré depuis `.git-poc-archive/` (archive conservée, gitignorée). Ne pas supprimer tant que le dépôt n'est pas poussé.
- **`data/chesscoach.db` est `root:root`** (Docker) : écriture impossible en local → **dev sur une copie** `data/chesscoach-dev.db`
  (gitignorée, 5 199 parties, elle subit les migrations). L'original ne doit PAS être migré tant que son propriétaire
  n'est pas l'utilisateur d'exploitation (prévoir `chown` dans le déploiement). Backup de sécurité : `/tmp/opencode/chesscoach.db.bak.v6`.
- Pas de binaire `sqlite3` sur le système → utiliser python `sqlite3` en lecture-ro (`file:...?mode=ro`).
- L'API chess.com PubAPI : refresh max 12 h, 429 sur requêtes parallèles, séries OK → sérialiser les appels, `User-Agent` propre.
- La data `data/chesscoach.db` (191 Mo, 320k plis) est le jeu de test principal — ne jamais la supprimer/corrompre (migrations versionnées uniquement).
- `pkill -f` avec un motif présent dans la ligne de commande du shell opencode → tue le shell. Viser par PID (`pgrep -f ... | head -1`).
- `admin@chesscoach.local` est rejeté par email-validator (domaine réservé) → utiliser `.io`.