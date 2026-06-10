import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, "..", "derby.db");

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS races (
    race_id       INTEGER PRIMARY KEY,
    state         TEXT NOT NULL DEFAULT 'idle',
    seed_commit   TEXT,
    seed_reveal   TEXT,
    started_at    INTEGER,
    finished_at   INTEGER,
    winner_id     INTEGER,
    winner_name   TEXT,
    proof_hash    TEXT,
    on_chain      INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    race_id     INTEGER NOT NULL,
    player      TEXT NOT NULL,
    lobster_id  INTEGER NOT NULL,
    tokens      INTEGER NOT NULL,
    payout      INTEGER,
    FOREIGN KEY (race_id) REFERENCES races(race_id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    player      TEXT PRIMARY KEY,
    net_delta   INTEGER NOT NULL DEFAULT 0,
    last_update INTEGER NOT NULL DEFAULT 0
  );
`);

export default db;
