# ChessCoach

Coach d'échecs personnel : il récupère automatiquement tes parties chess.com, les analyse avec Stockfish et te produit des retours pédagogiques adaptés à ton niveau — profil de forces/faiblesses, exercices de vos pires bévues, revue de parties, tendances et objectif Elo par format, et un agent IA (LLM) qui répond à tes questions.

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

---

## Synchronisation & analyse

- **Auto-sync** : toutes les 6 h (réglable), récupère le fichier mensuel complet de l'archive chess.com puis déduplique par PGN. Le cache de l'API chess.com peut retarder les nouvelles parties de 12 à 24 h.
- **Worker d'analyse** : tourne en continu, traite les parties par lots de 25 (`analysis_batch_size`) avec une pause (`analysis_batch_sleep`).
- **Manuel** : bouton « Récupérer les dernières parties » dans le dashboard, ou `POST /api/sync` — la tâche s'exécute en arrière-plan.
- Seuls les formats **rapid** et **blitz**, règles standard, avec PGN non vide, sont importés.

---

## API (extraits)

| Méthode | Route | Description |
| --- | --- | --- |
| `POST` | `/api/sync` | Lance la sync + analyse (tâche de fond) |
| `GET` | `/api/sync/status` | État de la sync et du worker |
| `GET` | `/api/games` | Parties paginées (`total` + `items`), filtres time_class/status/eco |
| `GET` | `/api/games/{id}` | Détail d'une partie + plis analysés |
| `GET` | `/api/stats` | Stats globales par format |
| `GET` | `/api/profile/{username}` | Profil pédagogique (global ou `?time_class=`) |
| `GET` | `/api/profile/{username}/all` | Profil global + rapide + blitz, cohérents entre eux |
| `POST` | `/api/profile/{username}/recompute` | Recalcule et archive un snapshot |
| `GET` | `/api/profile/{username}/history` | Courbe Elo (snapshots) |
| `GET` | `/api/exercices` | Exercices (rotation intégrée), filtre `?concept=` |
| `GET` | `/api/moves` | Coups fautifs récents, filtres avancés |
| `GET/POST` | `/api/etudes` | Statistiques / enregistrement d'une tentative d'exercice |
| `POST` | `/api/chat` | Message à l'agent coach (si LLM activé) |
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
│       ├── pages/          # Dashboard, Profil, Progression, Pratique, Parties, Revue, Coach, Paramètres
│       ├── components/     # Chat, courbe d'évaluation…
│       ├── board.ts        # Aide au clic (coups légaux, tryPlay)
│       └── settings.ts     # Réglages locaux (localStorage)
├── data/                   # SQLite + cache (non versionné)
└── docker-compose.yml
```

---

## Notes

- La base SQLite vit dans `data/` (non versionnée) ; le schéma est créé/migré au démarrage de l'API (`SCHEMA_VERSION`).
- Le profil est recalculé et mis en cache par format ; il est toujours cohérent entre l'onglet Global et Rapide/Blitz (calcul unique + invalidation quand le volume change).
- Licence : usage personnel.
