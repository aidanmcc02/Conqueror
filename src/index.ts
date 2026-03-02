import { config } from "./config.js";
import {
  isMatchProcessed,
  insertMatch,
  markMatchProcessed,
  runMigrations,
} from "./db/index.js";
import { getLinkedUsers, postNotify } from "./meeps/client.js";
import { startServer } from "./server.js";
import {
  getPuuidAndRegion,
  getMatchIds,
  getMatchDetails,
  type RegionGroup,
} from "./riot/client.js";
import { parseRiotId } from "./utils/parseRiotId.js";

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

      await insertMatch(
        matchId,
        puuid,
        game_name,
        tag_line,
        details.placement,
        details.comp,
        details.gameMode,
        details.gameEndTime,
        {
          units: details.units,
          gameDuration: details.gameDuration,
          level: details.level,
          traits: details.traits,
          regionGroup: details.regionGroup,
        }
      );
      await markMatchProcessed(matchId, puuid);
      console.log(
        `[Conqueror] Notified: ${game_name}#${tag_line} - #${details.placement} (${details.gameMode})`
      );
    } catch (err) {
      console.warn(`[Conqueror] Error processing match ${matchId}:`, err);
    }
  }
}

let cachedUsers: Awaited<ReturnType<typeof getLinkedUsers>> = [];

async function poll(): Promise<void> {
  if (!cachedUsers.length) {
    console.log("[Conqueror] No linked users to poll");
    return;
  }

  console.log(`[Conqueror] Polling ${cachedUsers.length} linked user(s)`);
  for (const user of cachedUsers) {
    await processUser(user);
  }
}

async function main(): Promise<void> {
  console.log("[Conqueror] Starting TFT match tracker for Meeps");
  console.log(`[Conqueror] Meeps API: ${config.meepsApiUrl}`);
  console.log(`[Conqueror] Poll interval: ${config.pollIntervalMs}ms`);

  await runMigrations();
  startServer();

  try {
    cachedUsers = (await getLinkedUsers()) ?? [];
    console.log(`[Conqueror] Loaded ${cachedUsers.length} linked user(s) at startup`);
  } catch (err) {
    console.error("[Conqueror] Failed to fetch linked users at startup:", err);
    process.exit(1);
  }

  await poll();
  setInterval(poll, config.pollIntervalMs);
}

main().catch((err) => {
  console.error("[Conqueror] Fatal error:", err);
  process.exit(1);
});
