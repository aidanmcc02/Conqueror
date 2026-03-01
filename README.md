# Conqueror

TFT match tracker for Meeps. Polls the Riot TFT API for linked users' recent matches and posts new results to Meeps.

## Architecture

```
Conqueror → polls Riot TFT API → posts to Meeps API → Meeps stores & broadcasts
                ↓
        PostgreSQL (deduplication)
```

## Setup

### 1. Environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `RIOT_API_KEY` | Yes | From [Riot Developer Portal](https://developer.riotgames.com/) |
| `CONQUEROR_DATABASE_URL` or `DATABASE_URL` | Yes | PostgreSQL for match deduplication |
| `MEEPS_API_URL` | Yes | Meeps backend URL (e.g. `https://meeps-backend.railway.app`) |
| `CONQUEROR_WEBHOOK_SECRET` | Yes | Shared secret for Meeps API auth |
| `POLL_INTERVAL_MS` | No | Poll interval (default: 60000 = 1 min) |

### 2. Database

Migrations run automatically in two ways:

- **preDeployCommand** – In `railway.json`, `npm run migrate` runs before each deploy. That executes `scripts/run-migrations.js`, which applies any pending migrations.
- **On server start** – When the app starts, `index.ts` calls `runMigrations({ silent: true })`. So migrations run again on startup if they weren’t run earlier.

Both use the same migration runner, which only applies migrations that haven’t been applied yet (via `schema_migrations`), so running them twice is safe.

### 3. Run

```bash
npm install
npm run build
npm start
```

For development:

```bash
npm run dev
```

Run tests:

```bash
npm test
```

### CI

- **GitHub Actions** – Tests run on push and pull requests to `main`/`master` (`.github/workflows/test.yml`).
- **Railway** – Tests run as part of `npm run build` before deploy; a failing build blocks deployment.

## Railway deployment

1. Create a new Railway project.
2. Add a PostgreSQL service.
3. Deploy this repo as a service.
4. Set env vars in Railway dashboard. Migrations run automatically on each deploy.

## Meeps integration

Conqueror expects:

- **GET /api/conqueror-linked-users** – Auth via `X-Conqueror-Secret`. Returns users with `league_username`.

- **POST /api/conqueror-notify** – Auth via `X-Conqueror-Secret`. Payload:

```json
{
  "gameName": "FM Stew",
  "tagLine": "MEEPS",
  "matchId": "EUW1_1234567890",
  "placement": 1,
  "comp": "K/DA Ahri, True Damage",
  "gameMode": "ranked"
}
```

`gameMode`: `"normal"` | `"ranked"` | `"double_up"`
