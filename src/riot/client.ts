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

// Map region group to platform for TFT League API (uses platform routing)
function regionGroupToPlatform(
  regionGroup: RegionGroup
): (typeof Constants.Regions)[keyof typeof Constants.Regions] {
  switch (regionGroup) {
    case Constants.RegionGroups.AMERICAS:
      return Constants.Regions.AMERICA_NORTH;
    case Constants.RegionGroups.EUROPE:
      return Constants.Regions.EU_WEST;
    case Constants.RegionGroups.ASIA:
      return Constants.Regions.KOREA;
    case Constants.RegionGroups.SEA:
      return Constants.Regions.OCEANIA;
    default:
      return Constants.Regions.EU_WEST;
  }
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
  /** Human-readable comp name (e.g. "Void Longshot"). Optional; Meeps infers if omitted. */
  compName?: string;
  units?: UnitSummary[];
  champions?: string[];
  gameDuration?: number;
  level?: number;
  traits?: TraitSummary[];
  regionGroup?: string;
  lpChange?: number;
  ratedTier?: string;
  ratedDivision?: string;
  ratedRating?: number;
  currentRank?: string;
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
    lp_gain?: number;
    rated_tier?: string;
    rated_division?: string;
    rated_rating?: number;
  }>;
};

async function getLeagueEntry(
  puuid: string,
  regionGroup: RegionGroup
): Promise<{ tier: string; division: string; leaguePoints: number } | null> {
  try {
    const platform = regionGroupToPlatform(regionGroup);
    const res = await tftApi.League.getByPUUID(puuid, platform);
    const entries = res.response ?? [];
    const rankedTft = entries.find(
      (e: { queueType?: string }) => e.queueType === "RANKED_TFT"
    );
    if (!rankedTft) return null;
    const e = rankedTft as { tier?: string; rank?: string; leaguePoints?: number };
    return {
      tier: e.tier ?? "",
      division: e.rank ?? "",
      leaguePoints: Math.round(e.leaguePoints ?? 0),
    };
  } catch {
    return null;
  }
}

/** Infer human-readable comp name from traits (e.g. "Void Longshot", "Arcanist"). */
function inferCompName(traits: TraitSummary[]): string | undefined {
  if (!traits.length) return undefined;
  const sorted = [...traits]
    .filter((t) => !t.name?.includes("Unique"))
    .sort((a, b) => b.num_units - a.num_units);
  const top = sorted.slice(0, 2);
  if (!top.length) return undefined;
  const names = top.map((t) => {
    const raw = (t.name ?? "").replace(/^TFT\d*_/, "");
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }).filter(Boolean);
  return names.length ? names.join(" ") : undefined;
}

function formatCurrentRank(tier: string, division: string, lp: number): string {
  const tierName = tier ? tier.charAt(0) + tier.slice(1).toLowerCase() : "";
  if (!tierName) return "";
  if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)) {
    return lp > 0 ? `${tierName} ${lp} LP` : tierName;
  }
  if (!division) return tierName;
  const divNum = { I: "1", II: "2", III: "3", IV: "4" }[division] ?? division;
  return lp > 0 ? `${tierName} ${divNum} ${lp} LP` : `${tierName} ${divNum}`;
}

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

  // Riot TFT queue IDs: 1090=normal, 1100=ranked, 1150=double_up (per queues.json + Double Up)
  const queueId = info.queue_id ?? 0;
  const gameMode =
    queueId === 1150 ? "double_up" : queueId === 1100 ? "ranked" : "normal";

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
      ...(u.tier != null && { tier: Math.round(u.tier) }),
      ...(u.items?.length ? { items: u.items } : undefined),
    }));

  const champions = rawUnits
    .map((u) => u.character_id)
    .filter((id): id is string => Boolean(id));

  const traits: TraitSummary[] = (participant.traits ?? [])
    .filter((t) => (t.tier_current ?? t.num_units ?? 0) > 0)
    .map((t) => ({
      name: t.name ?? "Unknown",
      num_units: Math.round(t.tier_current ?? t.num_units ?? 0),
    }));

  const gameDuration =
    info.game_length != null ? Math.round(info.game_length) : undefined;
  const level =
    participant.level != null ? Math.round(participant.level) : undefined;

  const p = participant as {
    lp_gain?: number;
    rated_tier?: string;
    rated_division?: string;
    rated_rating?: number;
  };
  let lpChange: number | undefined;
  let ratedTier: string | undefined;
  let ratedDivision: string | undefined;
  let ratedRating: number | undefined;
  let currentRank: string | undefined;

  if (gameMode === "ranked") {
    lpChange = p.lp_gain != null ? Math.round(p.lp_gain) : undefined;
    ratedTier = p.rated_tier ?? undefined;
    ratedDivision = p.rated_division ?? undefined;
    ratedRating = p.rated_rating != null ? Math.round(p.rated_rating) : undefined;

    if (!ratedTier || !ratedDivision) {
      const league = await getLeagueEntry(targetPuuid, regionGroup);
      if (league) {
        ratedTier = ratedTier ?? league.tier;
        ratedDivision = ratedDivision ?? league.division;
        ratedRating = ratedRating ?? league.leaguePoints;
        currentRank = formatCurrentRank(
          league.tier,
          league.division,
          league.leaguePoints
        );
      }
    } else {
      currentRank = formatCurrentRank(
        ratedTier,
        ratedDivision,
        ratedRating ?? 0
      );
    }
  }

  return {
    matchId,
    puuid: targetPuuid,
    placement: participant.placement ?? 0,
    comp,
    gameMode,
    gameName: "",
    tagLine: "",
    gameEndTime,
    compName: inferCompName(traits),
    units: units.length ? units : undefined,
    champions: champions.length ? champions : undefined,
    gameDuration,
    level,
    traits: traits.length ? traits : undefined,
    regionGroup: String(regionGroup),
    lpChange,
    ratedTier,
    ratedDivision,
    ratedRating,
    currentRank,
  };
}
