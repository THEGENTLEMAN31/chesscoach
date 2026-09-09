# ChessCoach

Coach d'échecs personnel : il récupère automatiquement tes parties chess.com, les analyse avec Stockfish et te produit des retours pédagogiques adaptés à ton niveau — profil de forces/faiblesses, exercices de vos pires bévues, revue de parties, tendances et objectif Elo par format, et un agent IA (LLM) qui répond à tes questions. **Multi-utilisateurs** : chacun crée un compte avec son pseudo chess.com, ses données sont chargées à l'inscription et strictement isolées.

> Cible : **2000 Elo en Rapide, 1800 en Blitz**.

---

## Fonctionnalités

- **Synchronisation automatique** : import des parties chess.com (Rapide + Blitz) toutes les 6 h, avec déduplication par PGN.
- **Analyse Stockfish** : chaque coup est évalué (profondeur ~16-18), classification des erreurs (bévue / erreur / inexactitude / coup du livre), perte en centipawns et en probabilité de gain.
- **Profil pédagogique par format** : Elo actuel et tendance 30 j, précision et ACPL, forces/faiblesses par famille, concepts tactiques manquants, causes racines (temps, tilt, position gagnante…), conversion des positions gagnantes, objectif Elo et estimation en mois.
- **Progression** : courbe Elo dans le temps (snapshots par format) et concepts qui s'améliorent ou se dégradent.
- **Entraînement par positions** : tes pires bévues rejouées en exercices, avec un système de **rotation** (réussi → descend dans la liste ; raté → revient vite pour retenter). Clic façon Lichess (coups légaux en pointillés) ou glisser-déposer.
- **Revue de partie** : échiquier interactif, courbe d'évaluation, quiz « trouve le coup du moteur » sur les coups fautifs.
- **Agent coach IA** (optionnel, via OpenRouter) : outillé pour consulter tes parties, stats, profil, exercices, lancer une synchro, analyser des positions… et qui mémorise tes prescriptions.
- **Digest hebdomadaire** : récap automatique généré (LLM) de tes progrès.
- **Paramètres** : clic vs glisser, pointillés des coups légaux, affichage de la perte en pions ou en points de probabilité.

---

## Architecture

3 conteneurs Docker :

| Service | Rôle | Port |
| --- | --- | --- |
| `api` | API FastAPI + pipeline sync + worker d'analyse + agent LLM | `127.0.0.1:8001` (Caddy host proxifie `/api/*`) |
| `analyzer` | Service Stockfish (UCI) — évaluation des positions et des parties | 8002 (interne) |
| `web` | Frontend React (Caddy, statique + fallback SPA) | `127.0.0.1:8080` |

```
chess.com ──► api (sync + analyse) ──► SQLite (/data/chesscoach.db)
                  │
                  ▼
            agent LLM (OpenRouter, facultatif)
                  │
                  ▼
            web (React) ◄── API REST
```

---

## Démarrage rapide

Prérequis : Docker + Docker Compose.

```bash
cp .env.example .env      # puis renseigne COACH_USERNAME (et l'API LLM si tu veux l'agent)
docker compose up -d --build
```

Ouvre http://localhost:8080.

### Sans LLM

Tout le projet fonctionne sans clé OpenAI/OpenRouter : il te manquera seulement l'agent conversationnel et le digest automatique. Les profils, stats, entraînements et revues restent 100 % fonctionnels.

### Avec l'agent coach

```env
LLM_ENABLED=true
OPENROUTER_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini
```

---

## Variables d'environnement

Voir `.env.example` :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `COACH_USERNAME` | `thegentleman31` | Compte chess.com analysé |
| `LLM_ENABLED` | `false` | Active l'agent + digest LLM |
| `OPENROUTER_KEY` | — | Clé API OpenRouter |
| `OPENROUTER_MODEL` | — | Modèle (ex. `openai/gpt-4o-mini`) |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL du fournisseur LLM |

Réglages supplémentaires dans `api/app/config.py` : profondeur d'analyse par format, taille de lot du worker, intervalle de sync automatique, décalage horaire du joueur.

Variables d'auth (prod) :

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `JWT_SECRET` | `dev-secret-change-me` | Secret de session — **à changer en prod** (`openssl rand -hex 32`) |
| `COOKIE_SECURE` | `false` | `true` derrière TLS (Caddy) |
| `BASE_URL` | `http://localhost:8080` | URL publique (liens, cookie) |
| `ALLOW_REGISTRATION` | `true` | Inscription publique ouverte (multi-utilisateurs) |
| `SEED_ADMIN_PASSWORD` | — | Recrée l'admin `admin@chesscoach.io` au démarrage si absent (env prod) |

---

## Déploiement & ops (VPS, Caddy)

- **Reverse proxy** : Caddy host (`/etc/caddy/Caddyfile`), TLS Let's Encrypt auto. `chesscoach.btj.mooo.com`
  route `/api/*` → `127.0.0.1:8001` (API), le reste → `127.0.0.1:8080` (web statique Caddy, fallback SPA).
- **Images** : web = caddy:2-alpine ; api/analyzer = FastAPI.
- **Backup SQLite** : `scripts/backup-db.sh [dir]` (snapshot cohérent depuis le conteneur api,
  rétention 14 j). Cron ajouté : `30 3 * * *` (chaque nuit à 3h30).
- **Healthcheck** : `GET /api/health` (et `/health`) répond `{"ok": true}` si la base est accessible.
  Le service `api` a un `healthcheck` Docker (`docker inspect --format '{{.State.Health.Status}}' chesscoach-api`).
- **E2E** : `scripts/e2e/healthcheck.sh`, `scripts/e2e/e2e.sh` (auth + endpoints scopés + objectifs), 
  `scripts/e2e/import-url.sh <url>` (validation PubAPI/PNG d'un vrai import).
- **Resync locale** : la file `sync_queue` se vide automatiquement au montage et au retour réseau
  (`web/src/lib/local/sync.ts`), puis via le bouton « Sync ».

### Runbook opérations

**État / diagnostic**
```bash
docker compose ps                      # 3 conteneurs up ?
docker inspect --format '{{.State.Health.Status}}' chesscoach-api
curl -s https://chesscoach.btj.mooo.com/api/health
scripts/e2e/healthcheck.sh             # health API + Docker + web via Caddy
curl -s -I https://chesscoach.btj.mooo.com/ | head -n1   # 200 attendu
```

**Surveillance (uptime)**
- Le healthcheck Docker (`/api/health`) redémarre automatiquement un conteneur `restart: unless-stopped` défaillant.
- Atteindre un uptime externe : un probe HTTP externe sur `/api/health` et `/` (ex. UptimeRobot / Better Stack /
  Uptime Kuma) — une alerte si non-200 sur plus d'une minute. Le endpoint `/api/health` est volontairement
  sans auth pour pouvoir être sondé de l'extérieur.
- `docker compose logs --tail=200 api` puis `analyzer` pour diagnostiquer un pipeline bloqué.

**Revenir en arrière / rollback**
```bash
cd /home/gentleman31/chesscoach
git stash / git checkout <commit>       # revenir au code précédent
docker compose up -d --build
scripts/backup-db.sh                    # toujours un snapshot avant manip SQL/DB
```

**Base de données**
- La base est `data/chesscoach.db` (volumineuse, non versionnée). Backups : `scripts/backup-db.sh` (rétention 14 j).
- Restauration : arrêter `api`, remplacer `data/chesscoach.db` par un snapshot, relancer `docker compose up -d api`.
- Migrations : automatiques au démarrage (`SCHEMA_VERSION`), versionnées et idempotentes.

**Sécurité / secrets**
- `JWT_SECRET` doit être long et aléatoire en prod (`openssl rand -hex 32`) et changé si un autre opérateur
  y a accès. `COOKIE_SECURE=true` derrière TLS. `SEED_ADMIN_PASSWORD` fourni par l'env de l'exploitant.
- Si multi-opérateurs : déplacer `SEED_ADMIN_PASSWORD` et `JWT_SECRET` dans un vault (ex. `sops`/`age` ou le
  secret manager du VPS) plutôt que le `.env` brut.

**Redéploiement**
```bash
cd /home/gentleman31/chesscoach
git pull origin v2
docker compose up -d --build        # rebuild api (seed admin) + web
caddy reload --config /etc/caddy/Caddyfile   # si Caddyfile changé
scripts/backup-db.sh                # snapshot avant toute manip SQL
```


---

## Synchronisation & analyse

- **Auto-sync** : toutes les 6 h (réglable), récupère le fichier mensuel complet de l'archive chess.com puis déduplique par PGN. Le cache de l'API chess.com peut retarder les nouvelles parties de 12 à 24 h.
- **À la création du compte** : le premier sync est lancé automatiquement (charge l'historique rapid/blitz du pseudo, en tâche de fond). Le dashboard déclenche aussi le sync s'il ne reste aucune partie.
- **Worker d'analyse** : tourne en continu, traite les parties par lots de 25 (`analysis_batch_size`) avec une pause (`analysis_batch_sleep`).
- **Manuel** : bouton « Récupérer les dernières parties » dans le dashboard, ou `POST /api/sync` — la tâche s'exécute en arrière-plan.
- Seuls les formats **rapid** et **blitz**, règles standard, avec PGN non vide, sont importés.

---

## API (extraits)

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health`, `/health` | Santé (base OK) — utilisé par le healthcheck Docker |
| `POST` | `/api/sync` | Lance la sync + analyse (tâche de fond) |
| `GET` | `/api/sync/status` | État de la sync et du worker |
| `GET` | `/api/games` | Parties paginées (`total` + `items`), filtres time_class/status/eco |
| `GET` | `/api/games/{id}` | Détail d'une partie + plis analysés |
| `GET` | `/api/stats` | Stats globales par format |
| `GET` | `/api/profile` | Profil pédagogique de l'utilisateur (scopé par session), `?time_class=` |
| `GET` | `/api/profile/all` | Profil global + rapide + blitz, cohérents entre eux |
| `POST` | `/api/profile/recompute` | Recalcule et archive un snapshot |
| `GET` | `/api/profile/history` | Courbe Elo (snapshots) |
| `GET` | `/api/profile/objectives` | Objectifs Elo par format (modifiables) |
| `PUT` | `/api/profile/objectives` | Définit ses propres objectifs Elo (rapid/blitz) — recalcul auto |
| `GET` | `/api/exercices` | Exercices (rotation intégrée), filtres `?concept=&time_class=&classification=` |
| `GET` | `/api/moves` | Coups fautifs récents, filtres avancés |
| `GET/POST` | `/api/etudes` | Statistiques / enregistrement d'une tentative d'exercice |
| `POST` | `/api/sync/accept` | Accepte une analyse client (local-first P1) |
| `GET` | `/api/digest/latest` | Dernier digest hebdomadaire |

---

## Structure du projet

```
chesscoach/
├── api/                    # Backend Python (FastAPI)
│   ├── app/
│   │   ├── main.py         # Routes HTTP
│   │   ├── db.py           # Schéma SQLite (migrations)
│   │   ├── config.py       # Réglages
│   │   ├── chesscom.py     # Client API chess.com
│   │   ├── pgn.py          # Parseur PGN
│   │   ├── eval.py         # Conversions d'évaluation (cp ↔ probabilité)
│   │   ├── concepts.py     # Détection de motifs tactiques
│   │   ├── openings.py     # Livre d'ouvertures (ECO)
│   │   ├── analysis_client.py
│   │   ├── agent/          # Profil, stats, patterns, outils du LLM, graph
│   │   ├── routes/         # Routage de l'agent
│   │   └── services/       # sync + worker d'analyse + manager
│   ├── scripts/            # Scripts utilitaires (recalcul, init…)
│   └── Dockerfile
├── analyzer/               # Service Stockfish (UCI)
│   └── app/engine.py
├── web/                    # Frontend React (Vite + TypeScript)
│   └── src/
│       ├── pages/          # Dashboard, Profil, Progression, Pratique, Parties, Revue, Coach, Paramètres, Import
│       ├── components/     # Chat, courbe d'évaluation…
│       ├── lib/engine/     # Moteur Stockfish WASM (worker + hooks)
│       ├── lib/local/      # SQLite local (sql.js) + IndexedDB, repo, import, sync auto
│       ├── lib/shared/     # Portage TS d'éval/concepts (coeur commun client/serveur)
│       ├── board.ts        # Aide au clic (coups légaux, tryPlay)
│       └── settings.ts     # Réglages locaux (localStorage)
├── scripts/                 # backup-db.sh, vendor-engine.mjs…
├── data/                   # SQLite + cache (non versionné)
└── docker-compose.yml
```

---

## Notes

- La base SQLite vit dans `data/` (non versionnée) ; le schéma est créé/migré au démarrage de l'API (`SCHEMA_VERSION`).
- Le profil est recalculé et mis en cache par format ; il est toujours cohérent entre l'onglet Global et Rapide/Blitz (calcul unique + invalidation quand le volume change).
- Licence : usage personnel.
