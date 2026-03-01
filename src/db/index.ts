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

export type MatchRow = {
  match_id: string;
  game_name: string;
  tag_line: string;
  placement: number;
  comp: string;
  game_mode: string;
  game_end_time: Date;
};

export async function insertMatch(
  matchId: string,
  puuid: string,
  gameName: string,
  tagLine: string,
  placement: number,
  comp: string,
  gameMode: "normal" | "ranked" | "double_up",
  gameEndTime: number
): Promise<void> {
  await pool.query(
    `INSERT INTO matches (match_id, puuid, game_name, tag_line, placement, comp, game_mode, game_end_time)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (match_id, puuid) DO UPDATE SET
       game_name = EXCLUDED.game_name,
       tag_line = EXCLUDED.tag_line,
       placement = EXCLUDED.placement,
       comp = EXCLUDED.comp,
       game_mode = EXCLUDED.game_mode,
       game_end_time = EXCLUDED.game_end_time`,
    [
      matchId,
      puuid,
      gameName,
      tagLine,
      placement,
      comp,
      gameMode,
      new Date(gameEndTime),
    ]
  );
}

export async function getRecentMatches(
  limit: number,
  offset: number,
  gameMode: "all" | "normal" | "ranked" | "double_up"
): Promise<{ matches: MatchRow[]; hasMore: boolean }> {
  const limitParam = Math.min(Math.max(limit, 1), 100);
  const offsetParam = Math.max(offset, 0);

  const whereClause =
    gameMode === "all"
      ? ""
      : "WHERE game_mode = $3";
  const params =
    gameMode === "all"
      ? [limitParam + 1, offsetParam]
      : [limitParam + 1, offsetParam, gameMode];

  const r = await pool.query(
    `SELECT match_id, game_name, tag_line, placement, comp, game_mode, game_end_time
     FROM matches
     ${whereClause}
     ORDER BY game_end_time DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const rows = r.rows as MatchRow[];
  const hasMore = rows.length > limitParam;
  const matches = hasMore ? rows.slice(0, limitParam) : rows;

  return { matches, hasMore };
}

export async function closeDb(): Promise<void> {
  await pool.end();
}
