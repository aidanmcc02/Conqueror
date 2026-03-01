import { TftApi, RiotApi, Constants } from "twisted";
import { config } from "../config.js";

const tftApi = new TftApi({
  key: config.riotApiKey,
  rateLimitRetry: true,
  rateLimitRetryAttempts: 3,
});

const riotApi = new RiotApi({ key: config.riotApiKey });

export type RegionGroup = (typeof Constants.RegionGroups)[keyof typeof Constants.RegionGroups];

const DEFAULT_REGION_GROUP = Constants.RegionGroups.EUROPE;

// Map platform id (e.g. euw1, na1) to TFT region group
function platformToRegionGroup(platform: string): (typeof Constants.RegionGroups)[keyof typeof Constants.RegionGroups] {
  const p = platform?.toLowerCase() ?? "";
  if (["kr", "jp1"].some((r) => p.includes(r))) return Constants.RegionGroups.ASIA;
  if (["oc1", "sg2", "tw2", "vn2", "ph2", "th2"].some((r) => p.includes(r))) return Constants.RegionGroups.SEA;
  if (["euw1", "eun1", "tr1", "ru", "me1"].some((r) => p.includes(r))) return Constants.RegionGroups.EUROPE;
  if (["na1", "br1", "la1", "la2"].some((r) => p.includes(r))) return Constants.RegionGroups.AMERICAS;
  return DEFAULT_REGION_GROUP;
}

export type TftMatchSummary = {
  matchId: string;
  puuid: string;
  placement: number;
  comp: string;
  gameMode: "normal" | "ranked" | "double_up";
  gameName: string;
  tagLine: string;
  gameEndTime: number; // ms since epoch
};

export async function getPuuidAndRegion(
  gameName: string,
  tagLine: string
): Promise<{ puuid: string; regionGroup: RegionGroup }> {
  const { response: account } = await riotApi.Account.getByRiotId(
    gameName,
    tagLine,
    Constants.RegionGroups.AMERICAS
  );
  if (!account?.puuid) throw new Error(`Riot account not found: ${gameName}#${tagLine}`);

  let regionGroup = DEFAULT_REGION_GROUP;
  try {
    const { response: region } = await riotApi.Account.getActiveRegion(
      account.puuid,
      Constants.Games.TFT,
      Constants.RegionGroups.AMERICAS
    );
    if (region?.region) regionGroup = platformToRegionGroup(region.region);
  } catch {
    // Use default
  }

  return { puuid: account.puuid, regionGroup };
}

export async function getMatchIds(puuid: string, regionGroup: RegionGroup): Promise<string[]> {
  const res = await tftApi.Match.list(puuid, regionGroup, { count: 20 });
  return res.response ?? [];
}

export async function getMatchDetails(
  matchId: string,
  regionGroup: RegionGroup,
  targetPuuid: string
): Promise<TftMatchSummary | null> {
  const res = await tftApi.Match.get(matchId, regionGroup);
  const match = res.response;
  if (!match?.info) return null;

  const participant = match.info.participants?.find((p) => p.puuid === targetPuuid);
  if (!participant) return null;

  const queueId = match.info.queue_id ?? 0;
  const gameMode =
    queueId === 1100 ? "double_up" : queueId === 1090 ? "ranked" : "normal";

  const traits = (participant.traits ?? [])
    .filter((t) => t.tier_current > 0)
    .map((t) => t.name)
    .join(", ");
  const units = (participant.units ?? [])
    .map((u) => u.character_id?.replace("TFT_", "") ?? u.name ?? "")
    .filter(Boolean);
  const comp = traits || units.join(", ") || "Unknown";

  const info = match.info as { game_datetime?: number };
  const gameEndTime = info.game_datetime ?? Date.now();

  return {
    matchId,
    puuid: targetPuuid,
    placement: participant.placement ?? 0,
    comp,
    gameMode,
    gameName: "",
    tagLine: "",
    gameEndTime,
  };
}
