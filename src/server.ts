import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getRecentMatches } from "./db/index.js";

function buildMatchUrl(matchId: string, regionGroup?: string | null): string | null {
  if (!matchId) return null;
  const region = (regionGroup ?? "americas").toLowerCase();
  return `https://tactics.tools/match/${region}/${matchId}`;
}

const GAME_MODES = [
  { id: "all", name: "All modes" },
  { id: "normal", name: "Normal" },
  { id: "ranked", name: "Ranked" },
  { id: "double_up", name: "Double Up" },
];

const app = express();

// Explicit OPTIONS handler first - catches ALL preflight requests (app.options("*") can miss nested paths)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin ?? "*";
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Cache-Control, Pragma, X-Conqueror-Secret, X-Diana-Secret, X-Build-Secret"
    );
    res.set("Access-Control-Max-Age", "86400");
    return res.status(204).end();
  }
  next();
});

// CORS for actual requests
app.use(
  cors({
    origin: true,
    methods: ["GET", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma",
      "X-Conqueror-Secret",
      "X-Diana-Secret",
      "X-Build-Secret",
    ],
    credentials: true,
  })
);

// Health check - verify app is reachable (Railway recommends binding 0.0.0.0)
app.get("/", (_req, res) => {
  res.json({ ok: true, service: "conqueror" });
});

app.get("/match/filters", (_req, res) => {
  res.json({ gameModes: GAME_MODES });
});

app.get("/match/recent", async (req, res) => {
  try {
    const limit = Math.min(
      parseInt(req.query.limit as string ?? "20", 10) || 20,
      100
    );
    const offset = Math.max(parseInt(req.query.offset as string ?? "0", 10) || 0, 0);
    const gameModeParam = ((req.query.gameMode as string) ?? "all").toLowerCase();
    const gameMode =
      ["all", "normal", "ranked", "double_up"].includes(gameModeParam)
        ? (gameModeParam as "all" | "normal" | "ranked" | "double_up")
        : "all";

    const { matches, hasMore } = await getRecentMatches(limit, offset, gameMode);

    const matchesJson = matches.map((m) => {
      const url = buildMatchUrl(m.match_id, m.region_group);
      return {
        matchId: m.match_id,
        gameName: m.game_name,
        tagLine: m.tag_line,
        placement: m.placement,
        comp: m.comp,
        gameMode: m.game_mode as "normal" | "ranked" | "double_up",
        gameEndTime: m.game_end_time.toISOString(),
        ...(m.units?.length && { units: m.units }),
        ...(m.units?.length && {
          champions: m.units.map((u) => u.character_id),
        }),
        ...(m.game_duration != null && { gameDuration: m.game_duration }),
        ...(m.level != null && { level: m.level }),
        ...(m.traits?.length && { traits: m.traits }),
        ...(url && { url }),
        ...(m.lp_change != null && { lpChange: m.lp_change }),
        ...(m.rated_tier && { ratedTier: m.rated_tier }),
        ...(m.rated_division && { ratedDivision: m.rated_division }),
        ...(m.rated_rating != null && { ratedRating: m.rated_rating }),
        ...(m.current_rank && { currentRank: m.current_rank }),
      };
    });

    res.json({ matches: matchesJson, hasMore });
  } catch (err) {
    console.error("[Conqueror] /match/recent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export function startServer(): ReturnType<express.Application["listen"]> {
  return app.listen(config.port, "0.0.0.0", () => {
    console.log(`[Conqueror] HTTP server listening on 0.0.0.0:${config.port}`);
  });
}
