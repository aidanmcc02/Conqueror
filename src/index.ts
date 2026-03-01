import { config } from "./config.js";
import { isMatchProcessed, markMatchProcessed, runMigrations } from "./db/index.js";
import { getLinkedUsers, postNotify } from "./meeps/client.js";
import {
  getPuuidAndRegion,
  getMatchIds,
  getMatchDetails,
  type RegionGroup,
} from "./riot/client.js";

function parseRiotId(leagueUsername: string): { gameName: string; tagLine: string } | null {
  if (!leagueUsername) return null;
  const match = leagueUsername.match(/^(.+)#(.+)$/);
  if (match) return { gameName: match[1].trim(), tagLine: match[2].trim() };
  return null;
}

async function processUser(user: {
  user_id: number;
  display_name: string;
  league_username: string;
  game_name: string;
  tag_line: string;
}): Promise<void> {
  let game_name = user.game_name;
  let tag_line = user.tag_line;
  if (!game_name || !tag_line) {
    const parsed = parseRiotId(user.league_username);
    if (!parsed) return;
    game_name = parsed.gameName;
    tag_line = parsed.tagLine;
  }

  let puuid: string;
  let regionGroup: RegionGroup;
  try {
    const result = await getPuuidAndRegion(game_name, tag_line);
    puuid = result.puuid;
    regionGroup = result.regionGroup;
  } catch (err) {
    console.warn(`[Conqueror] Skipping ${game_name}#${tag_line}:`, err);
    return;
  }

  let matchIds: string[];
  try {
    matchIds = await getMatchIds(puuid, regionGroup);
  } catch (err) {
    console.warn(`[Conqueror] Failed to fetch matches for ${game_name}:`, err);
    return;
  }

  for (const matchId of matchIds) {
    try {
      const alreadyProcessed = await isMatchProcessed(matchId);
      if (alreadyProcessed) continue;

      const details = await getMatchDetails(matchId, regionGroup, puuid);
      if (!details || details.placement < 1) continue;

      await postNotify({
        gameName: game_name,
        tagLine: tag_line,
        matchId,
        placement: details.placement,
        comp: details.comp,
        gameMode: details.gameMode,
      });

      await markMatchProcessed(matchId, puuid);
      console.log(
        `[Conqueror] Notified: ${game_name}#${tag_line} - #${details.placement} (${details.gameMode})`
      );
    } catch (err) {
      console.warn(`[Conqueror] Error processing match ${matchId}:`, err);
    }
  }
}

async function poll(): Promise<void> {
  let users;
  try {
    users = await getLinkedUsers();
  } catch (err) {
    console.error("[Conqueror] Failed to fetch linked users:", err);
    return;
  }

  if (!users?.length) {
    console.log("[Conqueror] No linked users to poll");
    return;
  }

  console.log(`[Conqueror] Polling ${users.length} linked user(s)`);
  for (const user of users) {
    await processUser(user);
  }
}

async function main(): Promise<void> {
  console.log("[Conqueror] Starting TFT match tracker for Meeps");
  console.log(`[Conqueror] Meeps API: ${config.meepsApiUrl}`);
  console.log(`[Conqueror] Poll interval: ${config.pollIntervalMs}ms`);

  await runMigrations();
  await poll();
  setInterval(poll, config.pollIntervalMs);
}

main().catch((err) => {
  console.error("[Conqueror] Fatal error:", err);
  process.exit(1);
});
