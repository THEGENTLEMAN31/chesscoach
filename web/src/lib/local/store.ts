import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { openDb, idbGet, idbPut } from "./idb";

const DB_NAME = "chesscoach";
const STORE = "kv";
const BLOB_KEY = "sqlite";
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS games (
  id              TEXT PRIMARY KEY,
  chesscom_id     INTEGER,
  username        TEXT NOT NULL,
  white           TEXT NOT NULL,
  black           TEXT NOT NULL,
  white_elo       INTEGER,
  black_elo       INTEGER,
  result          TEXT NOT NULL,
  player_color    TEXT NOT NULL,
  time_class      TEXT NOT NULL,
  time_control    TEXT,
  end_time        INTEGER,
  rules           TEXT NOT NULL DEFAULT 'chess',
  fen_start       TEXT,
  eco             TEXT,
  opening_name    TEXT,
  termination     TEXT,
  pgn             TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  server_id       INTEGER,
  accuracy        REAL,
  acpl            REAL,
  classifications TEXT,
  error           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS plies (
  game_id         TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  ply             INTEGER NOT NULL,
  move_number     INTEGER,
  color           TEXT,
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
  pv_best         TEXT,
  cp_loss         REAL,
  winprob_before  REAL,
  winprob_after   REAL,
  winprob_loss    REAL,
  classification  TEXT,
  clk             REAL,
  time_taken      REAL,
  phase           TEXT,
  is_book         INTEGER NOT NULL DEFAULT 0,
  is_player       INTEGER NOT NULL DEFAULT 0,
  concept         TEXT,
  PRIMARY KEY (game_id, ply)
);
CREATE TABLE IF NOT EXISTS sync_queue (
  game_id    TEXT PRIMARY KEY,
  tries      INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function loadSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({ locateFile: () => wasmUrl as unknown as string });
  }
  return sqlPromise;
}

async function persist(db: Database): Promise<void> {
  const data = db.export();
  const idb = await openDb(DB_NAME, 1, () => {});
  const tx = idb.transaction(STORE, "readwrite");
  await idbPut(tx.objectStore(STORE), data.buffer, BLOB_KEY);
}

/** Initialise (ou charge depuis IndexedDB) la base SQLite locale. */
export async function getDb(): Promise<Database> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const SQL = await loadSql();
    let db: Database;
    const idb = await openDb(DB_NAME, 1, (d) => {
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    });
    const tx = idb.transaction(STORE, "readonly");
    const blob = await idbGet<ArrayBuffer>(tx.objectStore(STORE), BLOB_KEY).catch(() => undefined);
    db = blob ? new SQL.Database(new Uint8Array(blob)) : new SQL.Database();
    db.run(SCHEMA_SQL);
    return db;
  })();
  return dbPromise as Promise<Database>;
}

/** Doit être appelé après chaque écriture (modules GUUI), non bloquant. */
export function saveLocal(): Promise<void> {
  return getDb().then(persist);
}

export async function getLocalMeta(): Promise<{ games: number; queue: number }> {
  const db = await getDb();
  const g = db.exec("SELECT COUNT(*) AS n FROM games");
  const q = db.exec("SELECT COUNT(*) AS n FROM sync_queue");
  const games = (g[0]?.values[0]?.[0] as number) ?? 0;
  const queue = (q[0]?.values[0]?.[0] as number) ?? 0;
  return { games, queue };
}

/** Initie sql.js sans garder de référence demandée (lodé à la demande). */
export async function warmSql(): Promise<void> {
  await loadSql();
}

export async function resetLocalDb(): Promise<void> {
  const db = await getDb();
  db.run("DELETE FROM plies; DELETE FROM sync_queue; DELETE FROM games;");
  await saveLocal();
}