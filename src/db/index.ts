import pg from "pg";
import { config } from "../config.js";
import { runMigrations as runMigrationsFromScript } from "../../scripts/run-migrations.js";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
});

export async function runMigrations(): Promise<void> {
  await runMigrationsFromScript(pool, { silent: true });
}

export async function isMatchProcessed(matchId: string): Promise<boolean> {
  const r = await pool.query(
    "SELECT 1 FROM processed_matches WHERE match_id = $1",
    [matchId]
  );
  return r.rowCount !== null && r.rowCount > 0;
}

export async function markMatchProcessed(matchId: string, puuid: string): Promise<void> {
  await pool.query(
    "INSERT INTO processed_matches (match_id, puuid) VALUES ($1, $2) ON CONFLICT (match_id) DO NOTHING",
    [matchId, puuid]
  );
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
