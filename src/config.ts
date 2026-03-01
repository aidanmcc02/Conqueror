import "dotenv/config";

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env: ${name}`);
  return val;
}

const dbUrl = process.env.CONQUEROR_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dbUrl) throw new Error("Missing CONQUEROR_DATABASE_URL or DATABASE_URL");

export const config = {
  riotApiKey: requireEnv("RIOT_API_KEY"),
  databaseUrl: dbUrl,
  meepsApiUrl: (process.env.MEEPS_API_URL ?? "https://meeps-backend.railway.app").replace(/\/$/, ""),
  webhookSecret: requireEnv("CONQUEROR_WEBHOOK_SECRET"),
  pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "60000", 10), // 1 min default
  port: parseInt(process.env.PORT ?? "3000", 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? process.env.MEEPS_FRONTEND_ORIGIN ?? "*").trim() || "*",
} as const;
