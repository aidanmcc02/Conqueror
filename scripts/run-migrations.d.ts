import type { Pool } from "pg";

export function runMigrations(
  pool: Pool,
  options?: { silent?: boolean }
): Promise<number>;
