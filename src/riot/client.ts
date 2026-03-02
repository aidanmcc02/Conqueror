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

export type UnitSummary = {
  character_id: string;
  tier?: number;
  items?: number[];
};

export type TraitSummary = {
  name: string;
  num_units: number;
};

export type TftMatchSummary = {
  matchId: string;
  puuid: string;
  placement: number;
  comp: string;
  gameMode: "normal" | "ranked" | "double_up";
  gameName: string;
  tagLine: string;
  gameEndTime: number; // ms since epoch
  units?: UnitSummary[];
  champions?: string[];
  gameDuration?: number;
  level?: number;
  traits?: TraitSummary[];
  regionGroup?: string;
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

// Riot TFT Match API response shape (twisted returns raw JSON)
type ParticipantUnit = { character_id?: string; tier?: number; items?: number[]; name?: string };
type ParticipantTrait = { name?: string; tier_current?: number; num_units?: number };
type MatchInfo = {
  game_datetime?: number;
  game_length?: number;
  queue_id?: number;
  participants?: Array<{
    puuid?: string;
    placement?: number;
    level?: number;
    traits?: ParticipantTrait[];
    units?: ParticipantUnit[];
  }>;
};

export async function getMatchDetails(
  matchId: string,
  regionGroup: RegionGroup,
  targetPuuid: string
): Promise<TftMatchSummary | null> {
  const res = await tftApi.Match.get(matchId, regionGroup);
  const match = res.response;
  if (!match?.info) return null;

  const info = match.info as MatchInfo;
  const participant = info.participants?.find((p) => p.puuid === targetPuuid);
  if (!participant) return null;

  const queueId = info.queue_id ?? 0;
  const gameMode =
    queueId === 1100 ? "double_up" : queueId === 1090 ? "ranked" : "normal";

  const traitNames = (participant.traits ?? [])
    .filter((t) => (t.tier_current ?? t.num_units ?? 0) > 0)
    .map((t) => t.name)
    .join(", ");
  const rawUnits = participant.units ?? [];
  const unitNames = rawUnits
    .map((u) => u.character_id?.replace(/^TFT\d*_/, "") ?? u.name ?? "")
    .filter(Boolean);
  const comp = traitNames || unitNames.join(", ") || "Unknown";

  const gameEndTime = info.game_datetime ?? Date.now();

  // Units with character_id for Community Dragon icons (tft{set}_{champion}_square.png)
  const units: UnitSummary[] = rawUnits
    .filter((u) => u.character_id)
    .map((u) => ({
      character_id: u.character_id!,
      ...(u.tier != null && { tier: u.tier }),
      ...(u.items?.length ? { items: u.items } : undefined),
    }));

  const champions = rawUnits
    .map((u) => u.character_id)
    .filter((id): id is string => Boolean(id));

  const traits: TraitSummary[] = (participant.traits ?? [])
    .filter((t) => (t.tier_current ?? t.num_units ?? 0) > 0)
    .map((t) => ({
      name: t.name ?? "Unknown",
      num_units: t.tier_current ?? t.num_units ?? 0,
    }));

  const gameDuration = info.game_length != null ? info.game_length : undefined;
  const level = participant.level != null ? participant.level : undefined;

  return {
    matchId,
    puuid: targetPuuid,
    placement: participant.placement ?? 0,
    comp,
    gameMode,
    gameName: "",
    tagLine: "",
    gameEndTime,
    units: units.length ? units : undefined,
    champions: champions.length ? champions : undefined,
    gameDuration,
    level,
    traits: traits.length ? traits : undefined,
    regionGroup: String(regionGroup),
  };
}
