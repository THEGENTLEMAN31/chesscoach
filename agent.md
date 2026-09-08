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
- ✅ Règles DA (obligatoires, à toute nouvelle UI) : **layout Bento / grid** ; fond noir profond multi-niveaux de surface ; texte blanc/gris (1 seul accent coloré discret) ; **espacements généreux** (gap ≥ 16px, padding confortable) ; pas d'emoji (icônes SVG) ; typographie système ; mobile-first.
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
- [x] Design system (suite) : shadcn/ui (components.json, cn, CSS vars branchées DA) + **Bklit UI line-chart** (registre @bklit/line-chart, vendu dans `src/components/charts/`)
- [x] Coach supprimée (route + Chat/Markdown/EvalCurve/MoveList retirés) + username hardcodé → session user (Scoping UI OK)
- [x] Corrections lors du port : `CLASS_LABEL[concept]` → `CONCEPT_LABEL[ply.concept]` (Revue), targets hardcodées → `profile.objective.targets` (Profil), relecture/puzzles/progression portés sur le DS

### Phase 1 — Cœur local-first
- [x] `EngineWorker` stockfish.js WASM : analyse incrémentale, barre d'avantage temps réel, MultiPV, profondeur adaptée device
- [x] SQLite local (schéma miroir serveur) + module d'analyse partagé `shared/` (portage eval/concepts en TS)
- [x] Import instantané partie : URL chess.com (`pub/game/{user}/{id}`) ou PGN → analyse locale → stockage local → file de sync
- [x] Vérification de solution par le Worker (check_solution porté côté client)

### Phase 2 — Backend serveur (VPS)
- [x] Endpoints import/sync des analyses client, validés Pydantic, scoping par session (`user_id`)
- [x] Batch d'analyse historique conservé (archive chess.com, depth 16–18, dédup)
- [~] Profil/progression/digest opérationnels multi-tenant — reste : digest optionnel/agent LLM en prod
- [ ] (v2 only) service puzzles lichess — PAS avant la v1

### Phase 3 — Refonte pages
- [~] **Entraînement** : puzzles de mes parties + filtres concept + suivi par concept + indicateur de réussite (porté). Reste : filtres cadence/gravité, rotation espacée
- [~] Dashboard : KPIs essentiels + sync + digest opérationnels ; reste : CTA « Analyser ma dernière partie », 5 dernières parties
- [~] Parties : liste + filtres format/statut + badges opérationnels ; reste : groupement par jour, cartes enrichies
- [~] Revue : échiquier interactif + modes Moteur/Teste-toi + EvalCurve Bklit + coups/classifications ; reste : panneau variantes MultiPV (P1), taxonomie détaillée
- [~] Progression : courbe Elo Bklit + tendances 30j + snapshots ; reste : sélecteur période
- [~] Profil : contenu conservé + objectifs depuis `profile.objective.targets`
- [ ] Réglages : toggles clic/coups légaux/éval rajoutés ✅ ; rien en attente

### Phase 4 — PWA & déploiement
- [x] PWA offline (lecture des données en cache), multi-appareils via sync
- [x] Déploiement VPS docker-compose (api + analyzer + web) + backup SQLite
- [x] Validation visuelle + go production

> **Déploiement = Caddy** (pas nginx) : reverse proxy public `chesscoach.btj.mooo.com`
> (TLS/Let's Encrypt auto) + conteneur `web` sur caddy:2-alpine (statique + fallback SPA).
> Caddy host route `/api/*` **directement** vers `127.0.0.1:8001` (API publiée sur le host),
> le reste vers `127.0.0.1:8080` (web statique). nginx entièrement retiré.
> Backup : `scripts/backup-db.sh` (snapshot cohérent via sqlite3 Python depuis le conteneur api,
> rétention 14 jours, cron 3h30).
> Auth prod : `JWT_SECRET`/`COOKIE_SECURE`/`BASE_URL`/`ALLOW_REGISTRATION=true` (multi-utilisateurs)/`SEED_ADMIN_PASSWORD`
> via `.env` (gitignored). Admin prod recréé au démarrage par le seed si absent
> (`is_verified`/`is_superuser` forcés au constructeur — fix `exclude_unset`).

## Multi-utilisateurs — activé et validé le 08/09
- **Principe** : chaque compte = un pseudo chess.com vérifié (PubAPI). `current_username`
  renvoie `user.chesscom_username` (session, jamais le client) → toutes les routes métier
  (games/stats/sync/training) sont sourdées par ce pseudo. Isolation prouvée en E2E prod
  (compte `hikaru` : 291 parties => seulement Hikaru/poohineedyou, zéro fuite admin).
- **Chargement à la création** : `auth.py` register lance `manager.start(pseudo, sync_months)`
  en tâche de fond après création → l'historique rapid/blitz du pseudo est récupéré+analysé
  automatiquement (pipeline scoped, dédup `(pgn, username)`). Le dashboard relance aussi le
  sync si aucune partie n'existe (première visite).
- `ALLOW_REGISTRATION=true` en prod (défaut compose). Seed admin (`thegentleman31`) inchangé.
- **UX** : contraste `text-muted` corrigé (liaison `--color-muted: var(--muted-foreground)`
  dans `@theme inline`), placeholder pseudo neutre (plus de `thegentleman31` exposé), message
  « Ce pseudo chess.com n'existe pas. Vérifie l'orthographe. ».

## Solide arrivé sur la prod le 08/09 (recommandations appliquées)
- **Sécurité** : mot de passe admin prod régénéré (seed + env, plus jamais de SQL direct), seed
  force désormais `is_verified`/`is_superuser`, `JWT_SECRET` en dur retiré du code (env prod), cookie secure.
  (L'inscription, initialement fermée, a ensuite été **rouverte** pour le multi-utilisateurs — cf. ci-dessus.)
- **Robustesse local-first** :
  - `web/src/lib/local/sync.ts` : `drainSyncQueue()` + `autoSync()` — resync automatique de la file
    au montage et au retour réseau (`navigator.onLine` / événement `online`).
  - Import : `ply` 1-based envoyé au serveur (aligné sur les parties natives ; internes locaux
    restent 0-based), `winprob_loss` inclus dans retrySync/drain → `acpl` désormais calculé (E2E : 32.5).

## TO-DO (recommandations restantes) — à faire plus tard
- [ ] **3. Qualité/repro** : E2E intégré au repo (`scripts/e2e/`) hors `/tmp`, healthcheck
      (`/api/health` + check Caddy), test d'un vrai import URL chess.com en prod.
- [ ] **4. Produit** : rotation espacée de l'entraînement, filtres cadence/gravité,
      groupe par jour / cartes enrichies, CTA « Analyser ma dernière partie », sélecteur période.
- [ ] **5. Ops** : runbook opérations détaillé dans README, surveillance alertes (uptime),
      migration du mot de passe seed en vault si multi-opérateurs.

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

## Session web — port pages V2 (fait le 08/09, commit 8b11779 poussé origin/v2)
- **shadcn/ui + Bklit line-chart intégrés** : `components.json` (style new-york), `lib/utils.ts` (cn = clsx+tailwind-merge),
  CSS vars shadcn branchées sur la DA (`:root`/`[data-theme]`, tokens neutres + `--chart-*` Bklit), `tw-animate-css`.
  Registre : `npx shadcn add @bklit/line-chart --yes --overwrite` (vedu dans `src/components/charts/`, deps @visx/d3/motion/@number-flow).
  Barrel `src/components/charts/index.ts`. `src/components/shimmering-text.tsx` créé (dépendance registre au chemin corrigé).
- **Adaptations Bklit** : `tsconfig.lib` ES2022→ES2023 (uses `.at()`), refs React18 castées (`useRef<SVGPathElement | null>`),
  hook `tickLabelFormatter` ajouté (LineChart → shell → dateLabels) pour axes « numéro de coup » (use `plyToDate/dateToPly` dans `lib/game/eval.ts`).
- **Composants partagés** : `components/Board.tsx` (Chessboard responsive via ResizeObserver, dnd touch/HTML5 auto, hints Lichess,
  promotion), `components/EvalCurve.tsx` (Bklit, tooltip typé, carry-forward des wp null), `components/MoveList.tsx` (DA).
- **Libs** : `lib/game/board.ts`, `lib/game/settings.ts` (localStorage `chesscoach:settings`), `lib/game/eval.ts`.
- **Pages portées** : Entraînement (puzzles, concepts, score, réplique adverse, recordEtude scoped session),
  Revue (moteur/quiz, exploration libre, fix `CONCEPT_LABEL[ply.concept]`), Progression (profileAll, courbe Bklit,
  tendances, snapshots), Profil (objectifs depuis `profile.objective.targets` → rapid 2000 / blitz 1800), Réglages
  (toggles clic/coups légaux/éval pions-probabilité).
- **Chunking** : manualChunks chart-vendor / motion / chess-vendor (bundle sans warning, 736 kB PWA).
- E2E via `vite preview :4173` + proxy → login admin 204 + cookie, stats/games/exercices/profile/all réelles.
  Admin de test : `admin@chesscoach.io` / `gentleman31_dev` (env `api/.env`).

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