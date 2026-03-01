#!/usr/bin/env node
/**
 * Migration runner - iterates over migrations/*.sql in order,
 * running each migration that hasn't been applied yet.
 *
 * Usage: node scripts/run-migrations.js
 * Or: npm run migrate
 *
 * Both preDeployCommand and server startup use this. Migrations are idempotent
 * via schema_migrations - only pending migrations are applied.
 */

import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

function getPool() {
  const url = process.env.CONQUEROR_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Missing CONQUEROR_DATABASE_URL or DATABASE_URL");
  return new pg.Pool({ connectionString: url });
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations(pool) {
  const result = await pool.query(
    "SELECT name FROM schema_migrations ORDER BY id"
  );
  return new Set(result.rows.map((r) => r.name));
}

function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function runMigration(pool, name, sql) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [
      name,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations(pool, options = {}) {
  const { silent = false } = options;
  const log = silent ? () => {} : (msg) => console.log(msg);

  await ensureMigrationsTable(pool);
  const applied = await getAppliedMigrations(pool);
  const files = getMigrationFiles();

  let runCount = 0;
  for (const file of files) {
    const name = path.basename(file, ".sql");
    if (applied.has(name)) {
      log(`  skip ${name}`);
      continue;
    }

    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, "utf8").trim();
    if (!sql) {
      log(`  skip ${name} (empty)`);
      continue;
    }

    log(`  run  ${name}`);
    await runMigration(pool, name, sql);
    runCount++;
  }

  return runCount;
}

async function main() {
  const pool = getPool();
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    process.exit(1);
  }

  console.log("Running migrations...");
  const runCount = await runMigrations(pool);
  console.log(`Done. Ran ${runCount} migration(s).`);
  await pool.end();
  process.exit(0);
}

const isMain = process.argv[1]?.endsWith("run-migrations.js");
if (isMain) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
