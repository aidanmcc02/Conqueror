import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { getRecentMatches } from "./db/index.js";

const GAME_MODES = [
  { id: "all", name: "All modes" },
  { id: "normal", name: "Normal" },
  { id: "ranked", name: "Ranked" },
  { id: "double_up", name: "Double Up" },
];

const app = express();

// CORS: origin: true reflects request origin (fixes Railway edge proxy). credentials: true for cookies if needed.
app.use(
  cors({
    origin: true,
    methods: ["GET", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Conqueror-Secret",
      "X-Diana-Secret",
      "X-Build-Secret",
    ],
    credentials: true,
  })
);

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

    const matchesJson = matches.map((m) => ({
      matchId: m.match_id,
      gameName: m.game_name,
      tagLine: m.tag_line,
      placement: m.placement,
      comp: m.comp,
      gameMode: m.game_mode as "normal" | "ranked" | "double_up",
      gameEndTime: m.game_end_time.toISOString(),
    }));

    res.json({ matches: matchesJson, hasMore });
  } catch (err) {
    console.error("[Conqueror] /match/recent error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export function startServer(): ReturnType<express.Application["listen"]> {
  return app.listen(config.port, () => {
    console.log(`[Conqueror] HTTP server listening on port ${config.port}`);
  });
}
