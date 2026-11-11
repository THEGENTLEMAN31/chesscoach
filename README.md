# ChessCoach

Coach d'échecs personnel, multi-utilisateurs et **local-first** : il récupère tes parties chess.com, les analyse avec Stockfish (sur ton appareil, via WASM) et te produit des retours pédagogiques — forces/faiblesses, pires bévues en exercices avec rotation, revue de partie façon Lichess, objectifs Elo par format.

> Cible : **2000 Elo en Rapide, 1800 en Blitz**.

---

## Principes fondateurs

Trois décisions qui structurent tout le reste :

1. **Le juge est le moteur, jamais un LLM.** Toute évaluation, classification, perte de probabilité, précision ou ACPL sort de Stockfish (natif serveur ou WASM navigateur) via un modèle déterministe et **commun** au frontend et au backend. Le LLM (optionnel) ne commente jamais la vérité technique.
2. **Local-first.** L'analyse interactive se fait sur l'appareil de l'utilisateur (Stockfish WASM + SQLite locale sql.js/IndexedDB). Le serveur ne décharge pas le travail de tous les utilisateurs sur une machine : il reconstruit l'historique à l'inscription, puis accepte les analyses locales. L'app marche aussi hors-ligne (PWA).
3. **L'identité est le pseudo chess.com.** Pas d'utilisateur abstrait : chaque compte s'attache à un pseudo vérifié sur la PubAPI. Toute la donnée est scopée par ce pseudo — isolation stricte multi-tenant.

---

## Architecture

```
                       ┌───────────────────────────── Caddy host (TLS Let's Encrypt) ─┐
 chess.com ──────────┬─►  chesscoach.btj.mooo.com  /api/*  ──► api ─────┐             │
                     │                        └─────── * ──────► web      │             │
   utilisateur (PWA) ─┤                                                │            │
      Stockfish WASM  └─► analyse locale ──► accept ──► api             │            │
                                                                    ┌────▼────┐       │
                                                                    │ analyzer│◄──────┘
                                                                    │(Stockfish│
                                                                    │  UCI)   │
                                                                    └─────────┘
```

| Service | Rôle | Accès |
| --- | --- | --- |
| `api` | API FastAPI : auth, sync, stats, profil, accept des analyses locales, digest | `127.0.0.1:8001` (Caddy host → `/api/*`) |
| `analyzer` | Service Stockfish **natif** (UCI) : juge technique, cache de positions | `8002` interne uniquement |
| `web` | Frontend React (Vite + Caddy statique, fallback SPA) | `127.0.0.1:8080` |

Le reverse proxy public est **Caddy sur l'hôte** (`/etc/caddy/Caddyfile`) ; le Caddy du conteneur `web` sert seulement les fichiers statiques. TLS auto Let's Encrypt.

---

## Choix d'architecture importants

### 1. Identité = pseudo chess.com **canonique** (casse normalisée)
À l'inscription, `POST /api/auth/register` vérifie le pseudo sur la PubAPI publique (sans clé). Chess.com renvoie un `301` vers la forme canonique en minuscules pour toute casse non canonique :
- le client HTTP suit la redirection (`follow_redirects=True`), sinon un faux « service chess.com indisponible » ;
- le compte est créé avec **le pseudo canonique retourné par l'API** (`profile.username`), pas la casse tapée ;
- la sync post-inscription reçoit ce même pseudo canonique → la donnée est stockée sous exactement la même casse que le scope des endpoints (`current_username`).

Conséquence : pas de comptes doublons `Ndreamms`/`ndreamms`, et le tableau d'un nouvel inscrit est immédiatement alimenté.

### 2. SQLite monofichier en WAL, SQL brut versionné
- Un seul fichier `data/chesscoach.db` (bind-mounté), **WAL** (`journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON`).
- Pas d'ORM pour la donnée métier : **aiosqlite + SQL explicite** (le projet est gourmand en agrégations ; docs frontières + migrations plus lisibles).
- Migrations **versionnées par `PRAGMA user_version`**, idempotentes, appliquées au démarrage (`SCHEMA_VERSION` : 8).
- L'auth vit dans la même base via SQLAlchemy (table `users`) — la cohabitation WAL fonctionne sans friction.

### 3. Auth : fastapi-users + cookie **httpOnly JWT**
- Login/refresh/logout via cookie `httpOnly` (`jwt_secret`, durée session 14 j), jamais lu en JS.
- Garde-fou au démarrage : **refus de lancer l'API si `JWT_SECRET` est encore le défaut ET l'inscription est ouverte**.
- Seed admin : `SEED_ADMIN_PASSWORD` (env) recrée `admin@chesscoach.io` lié à la data historique (`thegentleman31`) si absent.
- `ALLOW_REGISTRATION` pour ouvrir/fermer l'inscription ; `COOKIE_SECURE` derrière TLS.

### 4. Modèle d'évaluation déterministe et partagé
`api/app/eval.py` (+ portage TypeScript dans `web/src/lib/shared`) :
- **Win-probabilité logistique** : `wp = 100 / (1 + 10^(-cp/400))`, mats = 0 %/100 % ;
- **Classification façon Lichess** par perte de probabilité : `>=20` blunder, `>=10` mistake, `>=5` inaccuracy, `>=2` good, sinon best ;
- Précision = moyenne pondérée `MOVE_SCORE[classe]` ; ACPL = perte moyenne de probabilité.
C'est le fondement « honnête » : seuils constants, testables, **aucune intervention LLM**.

### 5. Analyse hybride : **client (WASM) + serveur (natif)**
- **Côté utilisateur** : Stockfish WASM (`/engine/*`) dans un Web Worker partagé, évaluations/interactif/exercices ; une partie analysée localement est poussée via `POST /api/sync/accept` (idempotent par pgn/chesscom_id, ré-agrège accuracy/ACPL côté serveur).
- **Côté serveur** : à l'inscription et à la sync auto, l'API reconstruit l'historique et l'analyse par lots (`/games/analyze` sur l'`analyzer`). Le batch serveur **ne tourne plus en continu** : l'essentiel de l'analyse quotidienne revient au client (local-first).
- Résultat commun : mêmes tables, mêmes statuts (`synced` → `analyzed`), mêmes agrégats.

### 6. Analyzer : un seul processus UCI, priorisé et mis en cache
`analyzer/` est le juge technique (ne connaît ni LLM ni profil) :
- **1 processus Stockfish**, thread-safe, lecture robuste `select` + `os.read` (ne se fige jamais) ; hash 128 Mo, 2 threads ;
- **file à priorité** : `P0` interactif (positions/lignes) vs `P1` batch (parties entières) ;
- **cache de positions SQLite** (`data/cache/positions.db`) pour ne pas réévaluer des FEN déjà vues.

### 7. Sync : archives mensuelles PubAPI, dédupliquée, reprenable
- Récupère `player/{u}/games/archives`, dernière(s) arches mensuelles (`sync_months`, défaut 1) ;
- **Dédup** par `chesscom_id` (sinon pgn) ; ne garde que `rapid`/`blitz`, règles standard, pgn non vide ;
- **Reprenable** : une partie `synced` pas encore `analyzed` est reprise au prochain passage (`sync_runs` trace chaque run) ;
- Par utilisateur : tâche asynchrone + verrou par pseudo (pas de double run) ; **auto-sync toutes les 6 h** sur les comptes connus.

### 8. Robustesse réseau (chess.com est capricieux)
- Client `httpx` : **retry exponentiel (tenacity)** sur 429/5xx/408/timeouts avec respect de `Retry-After` + `follow_redirects` (301 casse, voir #1) ;
- **Rate-limit middleware** en mémoire (fenêtre glissante) sur l'API ;
- Santé : `/api/health` (base OK) sans auth → healthcheck Docker → `restart: unless-stopped` recrée un service défaillant ; `RequestIdMiddleware` pour tracer une requête dans les logs json.

### 9. Frontend local-first & PWA
- **SQLite locale** (sql.js) + **IndexedDB** : import hors-ligne de PGN, file de sync (`web/src/lib/local/sync.ts`) qui se vide au retour réseau ;
- Moteur **Stockfish WASM** servi sur `/engine/*`, Web Worker partagé + PWA installable/offline (précache des assets, wasm moteur en `CacheFirst` au runtime) ;
- Piège évité : `public/engine/worker.js` est **committé** et le build `scripts/vendor-engine.mjs` ne fait plus que vitriner `stockfish.js`/`.wasm` — sans ça, un build écrasait le correctif PWA (normalisation du `Content-Type` du wasm servi par le cache → `instantiateStreaming` échouait sur les appareils en mode installé).

### 10. Déploiement & exploitation sans douleur
- **Caddy host** : TLS auto, `/api/*` → API, le reste → SPA ; web conteneur = Caddy statique (fallback SPA) ;
- **Backup SQLite** : `scripts/backup-db.sh` (snapshot cohérent depuis le conteneur, rétention 14 j), cron `30 3 * * *` ;
- **E2E** : `scripts/e2e/healthcheck.sh`, `e2e.sh` (auth + endpoints scopés), `import-url.sh` (validation PubAPI/PGN d'un vrai import) ;
- **Rollback** : `git stash/checkout` + `docker compose up -d --build` + `scripts/backup-db.sh` avant toute manip DB.

---

## Données (schéma mental)

| Table | Rôle |
| --- | --- |
| `games` | Parties, statut `synced/analyzed/error`, elo, résultat, pgn, accuracy/acpl/classifications |
| `plies` | Un coup par ligne : évals moteur, best move, cp_loss, win-probabilités, classification, concept, time_taken, `is_book`, `is_player` |
| `players` / `sync_runs` | Comptes analysés / journal des runs de sync |
| `profiles` (`player_profiles`) + `profile_history` | Profil pédagogique calculé/caché par format + snapshots Elo (courbe) |
| `studied_positions` | Exercices (pires bévues) et tentatives (rotation) |
| `player_objectives` / `digests` | Objectifs Elo par format / digest hebdo (sans LLM par défaut) |
| `users` | Comptes, `chesscom_username` UNIQUE = identité |

Toute la donnée métier est scopée par `username` (le pseudo canonique de la session) — aucune requête ne sort volontairement de ce scope.

---

## Synchronisation & analyse (dans la vie réelle)

- **Inscription** : compte créé → historique du pseudo chargé en tâche de fond (1 mois par défaut) → les parties passent par l'`analyzer` (batch natif) ;
- **Ensuite** : auto-sync toutes les 6 h ; le dashboard garde aussi un bouton « Récupérer les dernières parties » (`POST /api/sync`) ;
- **Chaque jour** : tes parties récentes sont analysées **sur ton appareil** (WASM) puis poussées (`/api/sync/accept`) ; en hors-ligne, tout est mis en file et synchronisé plus tard ;
- Formats importés : rapid + blitz, règles standard, pgn non vide.

---

## API (extraits)

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health`, `/health` | Santé (base OK) — healthcheck Docker |
| `POST` | `/api/auth/register` | Inscription (vérifie le pseudo sur chess.com, **casse normalisée**) |
| `POST` | `/api/auth/jwt/login` · `/logout` | Login cookie httpOnly JWT / déconnexion |
| `POST` | `/api/sync` | Sync + analyse historique (tâche de fond), « déjà en cours » → 409 |
| `GET` | `/api/sync/status` | État du pipeline et analyse restante |
| `POST` | `/api/sync/accept` | Accepte une partie analysée localement (idempotent) |
| `GET` | `/api/games` · `/api/games/{id}` · `/api/games/{id}/pgn` | Parties paginées / détail + plis / pgn brut |
| `GET` | `/api/stats` | Stats globales par format (accuracy, ACPL, classes, ouvertures…) |
| `GET/POST` | `/api/profile` (`?time_class=`) · `/recompute` · `/api/profile/all` · `/history` | Profil pédagogique calculé + cache + courbe Elo |
| `GET/PUT` | `/api/profile/objectives` | Objectifs Elo rapide/blitz (recalcul auto) |
| `GET` | `/api/exercices` · `/api/moves` · `GET/POST /api/etudes` | Exercices (rotation) + coups fautifs + tentatives |
| `GET` | `/api/digest/latest` · `POST /api/digest/generate` | Digest hebdo (déterministe, LLM optionnel) |

Tout est scopé par la session (`current_username`) sauf `/health`.

---

## Sécurité / secrets

- `JWT_SECRET` : long et aléatoire (`openssl rand -hex 32`), **refus de démarrer s'il est encore défaut avec inscription ouverte** ;
- `COOKIE_SECURE=true` derrière TLS ; `BASE_URL` pour les liens ;
- `SEED_ADMIN_PASSWORD` et `JWT_SECRET` : de préférence dans un vault (sops/age) plutôt que le `.env` brut si multi-opérateurs ;
- Le pseudo chess.com est l'unique identité : son unicité (`UNIQUE`) empêche les doublons ;
- Inscription publique : `ALLOW_REGISTRATION` (fermable) ; sensibilité aux emails : `verify_email`/`RESEND_KEY` optionnels.

---

## Démarrage rapide

```bash
cp .env.example .env      # renseigne COACH_USERNAME, JWT_SECRET (prod), SEED_ADMIN_PASSWORD
docker compose up -d --build
```

Ouvre http://localhost:8080 (dev) ou https://chesscoach.btj.mooo.com (prod).

Tout fonctionne **sans LLM** : il ne manque alors que le digest narratif (fallback déterministe déjà actif). Pour l'activer :

```env
LLM_ENABLED=true
OPENROUTER_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

---

## Variables d'environnement

Voir `.env.example`. Réglages avancés dans `api/app/config.py`.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `COACH_USERNAME` | `thegentleman31` | Compte analysé (seed/defaut) |
| `JWT_SECRET` | `dev-secret-change-me` | Secret de session — **à changer en prod** |
| `COOKIE_SECURE` | `false` | `true` derrière TLS (Caddy) |
| `BASE_URL` | `http://localhost:8080` | URL publique (liens, cookie) |
| `ALLOW_REGISTRATION` | `true` | Inscription publique (multi-utilisateurs) |
| `SEED_ADMIN_PASSWORD` | — | Recrée `admin@chesscoach.io` au démarrage (env prod) |
| `LLM_ENABLED` / `OPENROUTER_*` | `false` | Digest narratif (optionnel) |
| `ANALYZER_URL` | `http://analyzer:8002` | Service moteur natif |
| `VERIFY_EMAIL` / `RESEND_KEY` | `false`/— | Vérification email (à activer si besoin) |

Réglages moteur/sync (`config.py`) : profondeur rapide `18` / blitz `16`, `movetime` 2 s, batch d'analyse 25, auto-sync toutes les 6 h (`sync_months` défaut 1), décalage horaire du joueur pour l'analyse « soirée ».

---

## Runbook opérations

**État / diagnostic**
```bash
docker compose ps                       # 3 conteneurs up ?
docker inspect --format '{{.State.Health.Status}}' chesscoach-api   # + chesscoach-analyzer
curl -s https://chesscoach.btj.mooo.com/api/health
scripts/e2e/healthcheck.sh
curl -s -I https://chesscoach.btj.mooo.com/ | head -n1   # 200 attendu
```

**En cas de souci**
```bash
docker compose logs --tail=200 api        # puis analyzer pour un pipeline bloqué
docker compose restart api                # purge une transaction SQLite coincée (WAL)
```

**Base de données**
- `data/chesscoach.db` (volumineuse, non versionnée). Backups : `scripts/backup-db.sh` (rétention 14 j, cron `30 3 * * *`).
- Restauration : arrêter `api`, remplacer le fichier par un snapshot, relancer `docker compose up -d api`.
- Migrations automatiques et idempotentes au démarrage (`SCHEMA_VERSION`).

**Redéploiement / rollback**
```bash
cd /home/gentleman31/chesscoach
scripts/backup-db.sh                      # snapshot avant toute manip
git pull origin v2                        # ou git stash/checkout <commit> pour rollback
docker compose up -d --build
caddy reload --config /etc/caddy/Caddyfile   # si Caddyfile changé
```

**Surveillance** : le healthcheck Docker (`/api/health`) recrée un conteneur `restart: unless-stopped` défaillant ; une sonde externe (UptimeRobot / Kuma…) sur `/api/health` et `/` suffit pour l'alerte uptime.

---

## Structure du projet

```
chesscoach/
├── api/                    # Backend FastAPI
│   ├── app/
│   │   ├── main.py         # app + autosync + health
│   │   ├── db.py           # SQLite/WAL, migrations versionnées
│   │   ├── config.py       # + env (.env) — tous les réglages
│   │   ├── chesscom.py     # client PubAPI (retry + follow_redirects)
│   │   ├── pgn.py / eval.py / concepts.py / openings.py   # parsing, modèle d'éval, concepts, ECO
│   │   ├── analysis_client.py        # client HTTP vers analyzer
│   │   ├── users.py        # auth fastapi-users, seed admin, JWT cookie
│   │   ├── agents/…        # agent/ (profil, digest, outillage LLM optionnel)
│   │   ├── routers/        # auth, sync, games, stats, training
│   │   └── services/       # manager (per-user tasks) + sync (pipeline)
│   └── Dockerfile
├── analyzer/               # Service Stockfish natif (UCI)
│   └── app/engine.py, manager.py (P0/P1), cache.py, main.py
├── web/                    # Frontend React (Vite + TS)
│   ├── src/pages/          # Dashboard, Progression, Training, Games, GameReview, Import, Profile, Settings, Login, Register
│   ├── src/lib/engine/     # Worker WASM (engine.ts, use-engine.ts)
│   ├── src/lib/local/      # sql.js/IndexedDB, import, sync queue
│   ├── src/lib/shared/     # portage TS du modèle d'éval/concepts (parité client/serveur)
│   ├── public/engine/      # worker.js (committé) + stockfish.js/.wasm (vitrinés au build)
│   └── Dockerfile, Caddyfile
├── scripts/                # backup-db.sh, vendor-engine.mjs, e2e/
├── data/                   # SQLite + cache (non versionné, bind-mount)
└── docker-compose.yml
```

---

## Notes

- Licence : usage personnel. Le profil est calculé + caché par format et invalide quand le volume change.
- Le digest hebdo est **déterministe** par défaut (facts + template) ; le LLM n'apporte que la narration.
- L'agent conversationnel LLM est actuellement **dormant** (le module agent/profile alimente le profil pédagogique ; les routes de discussion ne sont pas exposées).

*Document d'architecture volontaire : récapitule les choix structurants du projet. Le code reste la source de vérité (voir `api/app/config.py`, `eval.py`, `db.py`).*
