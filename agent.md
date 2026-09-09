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
- [x] **Entraînement** : puzzles de mes parties + filtres concept + cadence + gravité + suivi par concept +
      rotation espacée (dernier essai raté remonte / réussi descend / maîtrisé en bas) + indicateur de réussite.
- [x] **Dashboard** : KPIs essentiels + sync + digest opérationnels + CTA « Mes dernières parties » (5 dernières).
- [x] **Parties** : liste + filtres format/statut + badges résultat + groupement par jour + cartes enrichies (elo).
- [~] **Revue** : échiquier interactif + modes Moteur/Teste-toi + EvalCurve Bklit + coups/classifications +
      explorateur tous coups (MultiPV) ; reste : taxonomie détaillée affinée.
- [x] **Progression** : courbe Elo Bklit + tendances 30j + snapshots + sélecteur période (30 j/90 j/1 an/tout).
- [x] **Profil** : contenu conservé + objectifs depuis `profile.objective.targets` + **objectif Elo modifiable** (PUT).
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

## Passe UX 09/09 — faite (commit 1de65a1)
- Nav : 6→5 items (Tableaux/Parties/Entraînement/Progression/Profil), Importer via bouton Parties, Réglages dispo mobile
- Typologie chess.com (Gaffe au lieu de Bévue, Coup optimal/théorique…)
- EvalBar : jauge verticale à droite de l'échiquier
- Settings étendus (flèches joué/meilleur, enchaîner exercices)
- Progression : légende départ/actuel/max/min + dates + axe X
- Profil : Concepts à travailler + Causes racines
- Training : sélecteur concepts → chips compactes
- E2E prod : nav 5 mobile ✓, réglages mobile ✓, Gaffe ✓, profil enrichi ✓

## TO-DO (recommandations restantes) — à faire plus tard
- [x] **Explorateur de variantes** (feedback 09/09) : lister les coups légaux de la position en
      exploration libre avec l'évaluation moteur de chacun (« et si je joue X ? »). ✅ implémenté
- [x] **Entraînements multi-coups** (feedback 09/09) : ne pas limiter les exercices à un seul coup —
      générer des variantes sur plusieurs coups (séquences / arbres de décision). ✅ implémenté
- [x] **3. Qualité/repro** : E2E intégré au repo (`scripts/e2e/healthcheck.sh`, `e2e.sh`, `import-url.sh`)
      hors /tmp ; healthcheck (`/api/health` + `/health` + `healthcheck` Docker) + test d'un vrai import
      URL chess.com en prod via PubAPI (import-url.sh). ✅ implémenté
- [x] **4. Produit** : filtres cadence/gravité entraînement (`?time_class=`/`?classification=`), groupe par
      jour / cartes enrichies (Parties), CTA « Mes dernières parties » (Dashboard), sélecteur période
      (Progression 30 j/90 j/1 an/tout), siège MultiPV en review (déjà via explorateur). ✅ implémenté
      — Suivi par concept ✅ : `data_service.etude_stats` renvoie désormais `correct` + `correct_rate` par
      concept, panneau « Suivi par concept » dans Training (barre de maîtrise ≥80%). Rotation espacée déjà en
      place dans `data_service.exercices` (raté remonte / réussi descend / maîtrisé en bas).
      — Taxonomie détaillée (Revue) ✅ : carte « Taxonomie détaillée » dans GameReview (par classification :
      nb coups, perte de proba cumulée, concepts attachés ×nb).
      — Indicateurs de forme ✅ : carte « Ma forme » Dashboard (V/N/D, série en cours, précision dernière
      partie + tendance) + barre « Forme (10 dernières) » dans Parties.
- [x] **5. Ops** : runbook opérations détaillé dans README (diagnostic, uptime, healthcheck, restore,
      secrets/vault) + surveillance alertes via probe externe sur `/api/health`. ✅ implémenté
      — Reste : migration du mot de passe seed en vault (à faire si multi-opérateurs).
- [x] **Objectif personnel modifiable** (feedback 09/09) : endpoint serveur
      `GET/PUT /api/profile/objectives` + table `player_objectives` (migration v7) + UI édition dans Profil.
      Objectifs par format surchargent `ELO_TARGETS`, recalcul auto. ✅ implémenté & testé
      (rapid 2100 → gap recalculé, reset OK).
- [~] **Pages encore minces** : Dashboard enrichi (dernières parties + carte « Ma forme ») ✅ ; Parties
      groupées par jour + barre forme ✅ ; entraînement : filtres cadence/gravité + suivi par concept ✅ ;
      reste : panneau MultiPV natif en review (l'explorateur libre couvre déjà « et si je joue X ? »).

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
---

# Audit experts (5) — « restes » & axes d'amélioration (09/09)

5 sous-agents experts lancés en parallèle (UX/UI/DA, Mobile, Échecs/Pédagogie, Backend/Scaling, Onboarding/Rétention),
chacun avec exploration du code + recherches web. Rapport consolidé ci-dessous. Rien n'est encore implémenté
(excepté le fix CSS ci-après si fait). Amorces de TO-DO, non engagées sauf mention.

## 0. BUG CONFIRMÉ (vérifié) — à corriger en premier
- **CSS variables charts cassées** : `web/src/styles.css` lignes 196-216, bloc `@theme inline` référence
  `var(----chart-*)` (**4 tirets**) alors que les variables existent en `--chart-*` (2 tirets) dans `:root`
  (lignes 29-43, 229-240). => toutes les couleurs de chart (scale/labels/tooltip/crosshair/grid/markers) sont
  undefined/fallback. Fix trivial : `----chart` → `--chart` sur ces ~21 lignes. **Fait : ✅ corrigé (09/09, sed global, non commité).**

## 1. UX / UI / DA
- **EloChart non-interactif** (SVG statique, pas de tooltip/hover) alors que `EvalCurve` utilise déjà visx `LineChart`
  avec tooltip — incoherence sur la page centrale. → migrer EloChart vers visx + tooltips + annotations de paliers (effort 2-3h, ROI élevé).
- **EvalBar quasi invisible en light mode** (`bg-white/80` sur fond blanc), une couleur, 32 px. → 2 couleurs vert/rouge, visible light, +tooltip.
- **Contraste `text-muted` limite** pour textes 10-13px en dark (`--color-muted:#8f97a1`). → monter ~`#a0aab4`.
- **Aucune micro-interaction de feedback** (sync, correction exercice, quiz, import) : pas de toast/animation de succès.
- **Empty states plats** sur toutes les pages (Dashboard vide = premier écran sans illustration ni CTA).
- **Accessibilité** : pas de `focus-visible`, cibles tactiles < 44px, aria-labels incohérents (PlyItem/VariantsPanel).
- **Design system incohérent** : couleurs hardcodées (`#3fb562`, cases échiquier `#ecece8`/`#c9c6bf` dans Board.tsx),
  double système de variables, `ShimmeringText` mort (jamais utilisé), `confirm()` natif dans Import.tsx.
- Top priorité : fix CSS bug → contraste → EloChart → focus-visible → micro-interactions → empty states.

## 2. Mobile / PWA
- **Pré-cache `.wasm` manquant** (stockfish + sql.js) dans `vite.config.ts` workbox (grep `assets/**/*.{js,css,woff2}`).
  → ajouter `wasm` + `engine/**` ; **cache API en NetworkFirst** + `navigateFallbackDenylist:[/^\/api/]`.
  ⚠ purge du cache à la déconnexion entre comptes (`caches.delete("api-cache")` dans logout).
- **Icônes PWA SVG non installables** (iOS/Android) → générer PNG (`@vite-pwa/assets-generator`),
  `apple-touch-icon-180`, `id:"/"`, `screenshots` dans manifest.
- **Session non persistée** : au boot, réseau KO → `api.me()` échoue → déconnecté (inaccessible aux parties locales).
  → persister session (zustand persist), distinguer erreur réseau (TypeError) vs 401 (seul vrai logout).
- Tactile échiquier : activer click-to-move par défaut sur mobile, tailles de cibles ≥44px.

## 3. Échecs / Pédagogie
- **Concept `candidate` = fourre-tout** : toute erreur non reconnue y tombe (`concepts.py:346`) ~30-50% des cas,
  trop vague pour être entraînable. → soit le supprimer, soit le subdiviser (voir stratégie ci-dessous).
  **Traité (session échecs) :** `candidate` renommé « Meilleur plan manqué » (fourre-tout assumé mais minoré) et
  subdivisé par 3 nouveaux détecteurs : `bad_trade` (« Mauvais échange », tactique), `king_exposure` (« Roi
  affaibli », sécurité du roi — brèche de rempart du roi roqué, luft f/h exclu) et `underdeveloped` (« Pièce
  passive négligée », stratégie — pièce mineure restée à la maison au milieu de jeu que le moteur activait).
  Validation sur 20,8k erreurs (dev) : bad_trade 45, king_exposure 69, underdeveloped 348 détectés. Portage TS
  `shared/concepts.ts` : parité mesurée 86,4% (1727/2000) sur un échantillon réel — les seuls écarts restants sont
  `pin_moved`/`pin_missed` (chess.js n'expose pas `is_pinned`, documenté en en-tête du fichier). Détection des
  attaques passée en pseudo-légal (miroir de `Board.attacks`) pour fourchette/hanging/bad_trade.
- **Concepts trop tactiques** (7/15), **peu de stratégie** : manquent espace, activité des pièces, chaînes de pions,
  faiblesse du roi (hors mat), échanges, zwischenzug, surcharge, déviation, découverte.
  **En partie traité :** activité des pièces (underdeveloped) + échanges (bad_trade) + faiblesse du roi
  (king_exposure) ajoutés. Reste : espace, chaînes de pions, zwischenzug, surcharge, déviation, découverte.
- **Tactique seule insuffisante** : pas d'exercices de stratégie (« quel est le plan »), finales (Lucena/Philidor/
  opposition/technique de promotion), évaluation, ni entrainement au **processus de calcul** (checklist CCT,
  vérification des coups de l'adversaire).
- **Pas de plan d'entraînement structuré** : `_prescribe()` reste textuel, non relié au flux Training.
- **Rotation espacée simplifiée** (binaire raté/réussi) sans intervalle SM-2/FSRS ; pas de suivi longitudinal par
  concept (dégradation non détectée / pas de courbe).
- Divers : quiz d'ouverture personnel absent (répertoire calculé mais non entraînable), patterns de mat non couverts,
  détection fragile (fourchette côté moteur seul, faiblesse pions progressive non détectée).
- 5 piliers temps (amateur 1200-2000) : tactique 30-40% / stratégie 25-35% / finales 15-20% / ouvertures 10-15% /
  analyse de ses parties 15-25%. ChessCoach ne couvre que le 1er (+partiellement le 5e).

## 4. Backend / Archi / Scaling
- **Rate limiting absent** (register/sync/etudes coûteux) → slowapi.
- **`asyncio.Lock` GLOBAL** dans `services/manager.py` serialise TOUS les utilisateurs → `dict[str, Lock]` par utilisateur.
- **JWT secret par défaut faible** (`config.py:50 "dev-secret-change-me"`) → garde-fou fatal si inchangé en prod.
- **CSRF** : cookie SameSite=Lax sans token → pattern double-submit pour mutations authentifiées cookie.
- **Aucun retry/backoff** sur chess.com (`chesscom.py`, 429/5xx tue le sync) ni sur analyzer → retry exponentiel 3x ;
  parties marquées `error` définitivement → ne marquer error qu'après 3 échecs.
- **Dedup par PGN fragile** → utiliser `chesscom_id` (UNIQUE(username, chesscom_id)) en clé.
- **Pas de CORS** (gênant en dev) ; **pas de logs structurés/métriques/request_id**.
- **`digest.py` `ON CONFLICT(id)` ne se déclenche jamais** (id auto) → doublon digest. Fix : `UNIQUE(username, period)`
  + `ON CONFLICT(username, period) DO UPDATE`.
- **`data_service.stats()` PAS scopé par username** (bug agent : stats tous comptes) → JOIN games WHERE username.
- `profile_history` croît sans limite ; `sync_auto_interval_h`/`sync_auto_initial_delay` configurés MAIS inutilisés
  (pas de sync périodique) ; `OpeningBook._directory()` ignore le paramètre.
- SQLite WAL **adéquat jusqu'à ~50 utilisateurs simultanés** → migration Postgres prématurée.

## 5. Onboarding / Rétention
> ⚠️ **PRINCIPE PRODUIT NON NÉGOCIABLE (décision 09/09)** : la rétention ne doit JAMAIS créer d'addiction ni de
> faux positifs. **Pas de gamification qui récompense la PRÉSENCE**, seulement des mécanismes qui servent
> L'APPRENTISSAGE réel. Référence anti-modèle : les flammes Snap — les gens envoient des photos sans intérêt juste
> pour conserver la série ; le mécanisme a perdu son but (garder le contact) et devient de la pression. Ici, on ne
> veut PAS que quelqu'un ouvre l'app 2 s « pour ne pas casser la série » ou fasse un exercice en bâclant.
>
> Conséquences concrètes que TOUT streak/notif/rew compétitif doit respecter :
> - **Pas de streak qui punit** : pas de compte à rebours stressant, pas de « streak en danger », pas de sanction
>   de perte. Rien qui incite à une action vide pour maintenir un chiffre.
> - **La métrique reflète l'apprentissage**, pas la présence : un temps minimal/l'achèvement réel, pas un simple
>   "login du jour". Un exercice bâclé (trop rapide / échec sans réflexion) ne doit PAS compter comme réussi.
> - **Ce qui compte c'est de revenir APPRENDRE** : la vrai boucle = le joueur revient parce qu'il progresse et que
>   le contenu lui est utile, pas parce qu'il perd un badge. Récompenser la maîtrise et le progrès réel, jamais
>   l'assiduité vide.
> - Les notifications doivent offrir de la VALEUR (un concept qui se dégrade, une nouvelle faiblesse détectée,
>   un retour utile), pas de la pression/pénurie.
>
- **Temps-avant-valeur trop long** : inscription → données utiles = heures (sync + analyse batch) sans feedback ni
  guidage. **Le vrai levier de rétention est le « aha » (profil pédagogique + 1er exercice perso), pas la punition.**
- Priorités :
  1. **Auto-login post-inscription** (Register.tsx, ROI ultra-élevé, effort faible).
  2. **Dashboard « première visite »** (wizard 3-4 étapes, barre de progression sync, teases pages, CTA objectif).
  3. **Empty states instructifs** partout (expliquer ce qui VA arriver, pas juste « rien »).
  4. **Engagement à la valeur, pas à la présence** : « Exercice du jour » issu de VOS erreurs récentes (pas un
     puzzle générique) + un retour concret « voici ta faiblesse du moment ». Revient parce que c'est utile.
     Si streak : optionnel, **non punitif** (+1 congé gratuit, jamais de sanction) et **conditionné à un vrai
     apprentissage** (exercice complété sérieusement, pas un login). Se poser : est-il même nécessaire ?
  5. **Notifications push PWA à VALEUR** (nouvelle faiblesse détectée, concept qui se dégrade, digest prêt),
     jamais « votre streak est en danger ». Fréquence sobre, désactivable, non-pénurique.
  6. **Digest exploité** : généré mais jamais distribué → email hebdo (Resend déjà présent) + version visuelle +
     cron. Le digest = compte-rendu de PROGRÈS réel, pas une injonction.
  7. Barre de progression vers l'objectif Elo (pas seulement Profil) + badges qui récompensent la **maîtrise**
     (concept ≥ 80% maintenu, précision en hausse), jamais la simple fréquence de connexion.

## Synthèse priorisée (cross-expert, ROI décroissant)
1. Fix bug CSS charts (`--chart`) — 15 min, global. ✅ si corrigé
2. Onboarding : auto-login + dashboard 1re visite + empty states (temps-avant-valeur heures→minutes)
3. Rétention **à la valeur, sans addiction** : aha moment + exercice du jour (vos erreurs) + notifs à valeur +
   digest de progrès ; streak uniquement si non punitif et basé sur l'apprentissage réel (voir §5 ⚠️ principe)
4. Backend robustness : rate limiting, retry chess.com & analyzer, lock par utilisateur, garde-fou JWT, fixes digest/stats scope
5. Échecs : sortir `candidate` du fourre-tout + ajouter concepts stratégie + exercices finales/stratégie + plan hebdo + vraie répétition espacée — **candidate subdivisé ✅** (bad_trade, king_exposure, underdeveloped ; parité TS 86,4%, écarts = pin uniquement). Reste : exercices finales/stratégie, plan hebdo, répétition espacée.
6. Mobile : précacher WASM + icônes PNG PWA + session persistée offline
7. UX polish : EloChart interactif, EvalBar, micro-interactions, accessibilité

> Statut : nota bene / TO-DO à traiter au fil des prochaines sessions. Non engagé sauf indication.
