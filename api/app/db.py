"""Couche base de données : SQLite + WAL, migrations versionnées, accès typé.

Choix délibéré d'utiliser aiosqlite + SQL explicite plutôt qu'un ORM :
le projet est gourmand en agrégations (stats, patterns cross-parties) ;
le SQL brut est plus lisible et sans magie. Les migrations sont versionnées
par `PRAGMA user_version` et appliquées dans l'ordre.
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

SCHEMA_VERSION = 7

MIGRATIONS: dict[int, str] = {
    1: """
    CREATE TABLE IF NOT EXISTS players (
        username         TEXT PRIMARY KEY,
        title            TEXT,
        is_active        INTEGER NOT NULL DEFAULT 1,
        first_analyzed_at TEXT,
        last_analyzed_at  TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS games (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        chesscom_id   INTEGER UNIQUE,
        username      TEXT NOT NULL,
        white         TEXT NOT NULL,
        black         TEXT NOT NULL,
        white_elo     INTEGER,
        black_elo     INTEGER,
        result        TEXT NOT NULL,          -- 1-0 / 0-1 / 1/2-1/2
        player_color  TEXT NOT NULL,          -- w / b
        time_class    TEXT NOT NULL,          -- rapid / blitz / bullet / daily
        time_control  TEXT,
        end_time      INTEGER,                -- unix seconds
        rules         TEXT NOT NULL DEFAULT 'chess',
        fen_start     TEXT,
        eco           TEXT,
        opening_name  TEXT,
        termination   TEXT,
        pgn           TEXT,
        status        TEXT NOT NULL DEFAULT 'synced',  -- synced / analyzed / error
        accuracy      REAL,
        acpl          REAL,
        classifications TEXT,                  -- json: {blunder: n, mistake: n, ...}
        error         TEXT,
        analyzed_at   TEXT,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_games_username_time ON games(username, end_time);
    CREATE INDEX IF NOT EXISTS idx_games_time_class  ON games(time_class);
    CREATE INDEX IF NOT EXISTS idx_games_eco         ON games(eco);

    CREATE TABLE IF NOT EXISTS plies (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id         INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        ply             INTEGER NOT NULL,       -- 0 = position initiale
        move_number     INTEGER,
        color           TEXT,                   -- w / b (coup joué)
        san             TEXT,
        uci             TEXT,
        fen_before      TEXT,
        fen_after       TEXT,
        eval_before_cp  REAL,
        mate_before     INTEGER,
        eval_after_cp   REAL,
        mate_after      INTEGER,
        best_move_uci   TEXT,
        best_move_san   TEXT,
        pv_best         TEXT,                   -- json: [uci...]
        cp_loss         REAL,
        winprob_before  REAL,
        winprob_after   REAL,
        winprob_loss    REAL,
        classification  TEXT,
        clk             REAL,                   -- secondes restantes avant le coup
        time_taken      REAL,
        phase           TEXT,                   -- opening / middlegame / endgame
        is_book         INTEGER NOT NULL DEFAULT 0,
        is_player       INTEGER NOT NULL DEFAULT 0,
        UNIQUE(game_id, ply)
    );
    CREATE INDEX IF NOT EXISTS idx_plies_game        ON plies(game_id);
    CREATE INDEX IF NOT EXISTS idx_plies_fen_before  ON plies(fen_before);
    CREATE INDEX IF NOT EXISTS idx_plies_class       ON plies(classification);

    CREATE TABLE IF NOT EXISTS sync_runs (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL,
        started_at    TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at   TEXT,
        games_seen    INTEGER DEFAULT 0,
        games_new     INTEGER DEFAULT 0,
        games_analyzed INTEGER DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'running',  -- running / done / error
        error         TEXT
    );
    """,
    2: """
    CREATE TABLE IF NOT EXISTS coach_memory (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL,          -- profile / prescription / diagnostic / feedback / note
        content     TEXT NOT NULL,
        source      TEXT,                   -- user / agent / digest
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS llm_usage (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        day        TEXT NOT NULL,           -- YYYY-MM-DD
        model      TEXT NOT NULL,
        tokens_in  INTEGER DEFAULT 0,
        tokens_out INTEGER DEFAULT 0,
        calls      INTEGER DEFAULT 0,
        UNIQUE(day, model)
    );

    CREATE TABLE IF NOT EXISTS digests (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        period     TEXT NOT NULL,           -- YYYY-MM-DD
        facts      TEXT,                    -- json structuré (déterministe)
        narrative  TEXT,                    -- narration FR (LLM ou template)
        status     TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """,
    3: """
    ALTER TABLE plies ADD COLUMN concept TEXT;
    ALTER TABLE plies ADD COLUMN concepts TEXT;

    CREATE TABLE IF NOT EXISTS player_profiles (
        username    TEXT PRIMARY KEY,
        profile     TEXT NOT NULL,          -- json structuré (modèle de l'élève)
        computed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """,
    4: """
    CREATE TABLE IF NOT EXISTS profile_history (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        username    TEXT NOT NULL,
        computed_at TEXT NOT NULL,
        elo         INTEGER,
        games       INTEGER,
        profile     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_history(username, computed_at);
    """,
    5: """
    CREATE TABLE IF NOT EXISTS studied_positions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT NOT NULL,
        time_class    TEXT NOT NULL DEFAULT 'global',
        game_id       INTEGER,
        ply           INTEGER,
        fen           TEXT NOT NULL,
        san           TEXT,
        best_move_uci TEXT NOT NULL,
        best_move_san TEXT,
        concept       TEXT,
        attempt       TEXT,
        correct       INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_studied_user_class ON studied_positions(username, time_class, created_at);

    CREATE TABLE IF NOT EXISTS player_profiles_v5 (
        username    TEXT NOT NULL,
        time_class  TEXT NOT NULL DEFAULT 'global',
        profile     TEXT NOT NULL,
        computed_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (username, time_class)
    );
    INSERT INTO player_profiles_v5 (username, time_class, profile, computed_at)
        SELECT username, 'global', profile, computed_at FROM player_profiles;
    DROP TABLE player_profiles;
    ALTER TABLE player_profiles_v5 RENAME TO player_profiles;

    ALTER TABLE profile_history ADD COLUMN time_class TEXT NOT NULL DEFAULT 'global';
    CREATE INDEX IF NOT EXISTS idx_profile_history_user_class
        ON profile_history(username, time_class, computed_at);
    """,
    6: """
    -- V2 multi-tenant : les digests appartiennent à un utilisateur.
    ALTER TABLE digests ADD COLUMN username TEXT;
    UPDATE digests SET username='thegentleman31' WHERE username IS NULL;
    CREATE INDEX IF NOT EXISTS idx_digests_user ON digests(username, period);
    """,
    7: """
    -- Objectifs Elo par format, modifiables par l'utilisateur (écrasent les cibles globales).
    CREATE TABLE IF NOT EXISTS player_objectives (
        username   TEXT PRIMARY KEY,
        rapid      INTEGER,
        blitz      INTEGER,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    """,
}


async def connect(path: Path) -> aiosqlite.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = await aiosqlite.connect(str(path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA busy_timeout=5000")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def migrate(db: aiosqlite.Connection) -> None:
    """Applique les migrations manquantes (versionnées)."""
    row = await db.execute("PRAGMA user_version")
    current = (await row.fetchone())[0]
    if current >= SCHEMA_VERSION:
        return
    for version in range(current + 1, SCHEMA_VERSION + 1):
        script = MIGRATIONS[version]
        # CREATE TABLE IF NOT EXISTS ne supporte pas multi-états : on découpe.
        for statement in script.split(";"):
            if statement.strip():
                await db.execute(statement)
        await db.execute(f"PRAGMA user_version = {version}")
        logger.info("Migration appliquée : version %s", version)
    await db.commit()


async def init_db(path: Path) -> aiosqlite.Connection:
    db = await connect(path)
    await migrate(db)
    return db


def db_lock(path: Path) -> sqlite3.Connection:
    """Connexion synchrone (thread de fond) partageant le même fichier."""
    conn = sqlite3.connect(str(path), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn
