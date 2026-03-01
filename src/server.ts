import http from "http";
import { config } from "./config.js";
import { getRecentMatches } from "./db/index.js";

const GAME_MODES = [
  { id: "all", name: "All modes" },
  { id: "normal", name: "Normal" },
  { id: "ranked", name: "Ranked" },
  { id: "double_up", name: "Double Up" },
];

function corsHeaders(origin: string | undefined): Record<string, string> {
  let allowOrigin: string;
  if (config.corsOrigin === "*") {
    allowOrigin = "*";
  } else {
    const allowed = config.corsOrigin.split(",").map((o) => o.trim()).filter(Boolean);
    if (origin && allowed.includes(origin)) {
      allowOrigin = origin;
    } else {
      allowOrigin = allowed[0] ?? "*";
    }
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf("?");
  return new URLSearchParams(idx >= 0 ? url.slice(idx) : "");
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    res.writeHead(405, headers);
    res.end();
    return;
  }

  const url = req.url ?? "/";
  const path = url.split("?")[0];

  if (path === "/match/filters") {
    res.writeHead(200, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify({ gameModes: GAME_MODES }));
    return;
  }

  if (path === "/match/recent") {
    try {
      const q = parseQuery(url);
      const limit = Math.min(
        parseInt(q.get("limit") ?? "20", 10) || 20,
        100
      );
      const offset = Math.max(parseInt(q.get("offset") ?? "0", 10) || 0, 0);
      const gameModeParam = (q.get("gameMode") ?? "all").toLowerCase();
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

      res.writeHead(200, { "Content-Type": "application/json", ...headers });
      res.end(JSON.stringify({ matches: matchesJson, hasMore }));
    } catch (err) {
      console.error("[Conqueror] /match/recent error:", err);
      res.writeHead(500, headers);
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  res.writeHead(404, headers);
  res.end();
});

export function startServer(): http.Server {
  server.listen(config.port, () => {
    console.log(`[Conqueror] HTTP server listening on port ${config.port}`);
  });
  return server;
}
