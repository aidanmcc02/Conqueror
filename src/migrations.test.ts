import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

describe("migrations", () => {
  it("migrations directory exists", () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it("001_initial_schema.sql exists and contains expected tables", () => {
    const schemaPath = path.join(MIGRATIONS_DIR, "001_initial_schema.sql");
    expect(fs.existsSync(schemaPath)).toBe(true);

    const sql = fs.readFileSync(schemaPath, "utf8");
    expect(sql).toContain("processed_matches");
    expect(sql).toContain("match_id");
    expect(sql).toContain("puuid");
    expect(sql).toContain("CREATE TABLE");
    expect(sql).toContain("CREATE INDEX");
  });
});
