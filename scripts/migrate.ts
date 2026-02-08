/**
 * Run schema migration using the same DATABASE_URL and Neon driver as the app.
 * Use this if drizzle-kit migrate applied to a different database (e.g. different driver/URL).
 *
 * Usage: npm run db:migrate   (from project root, so .env is loaded)
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Create a .env file with DATABASE_URL.");
  process.exit(1);
}

// Log which DB we're hitting (mask password)
const url = new URL(DATABASE_URL);
console.log("Using database:", url.hostname, "(same as app)");

const pool = new Pool({ connectionString: DATABASE_URL });

const migrationPath = join(process.cwd(), "migrations", "0000_init.sql");
const raw = readFileSync(migrationPath, "utf-8");

// Drizzle migration format: statements separated by --> statement-breakpoint
const blocks = raw.split(/\n--> statement-breakpoint\n/);
const statements: string[] = [];
for (const block of blocks) {
  const trimmed = block.trim();
  if (!trimmed) continue;
  // A block can contain multiple statements separated by ;
  const parts = trimmed.split(";").map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (part) statements.push(part + ";");
  }
}

async function run() {
  let applied = 0;
  let skipped = 0;
  for (const sql of statements) {
    try {
      await pool.query(sql);
      applied++;
      const preview = sql.slice(0, 50).replace(/\s+/g, " ");
      console.log("OK:", preview + "...");
    } catch (err: any) {
      const alreadyExists =
        err.code === "42P07" || // relation already exists
        err.code === "42710" || // duplicate_object (constraint already exists)
        /already exists/i.test(err.message || "");
      if (alreadyExists) {
        skipped++;
        console.log("Skip (already exists):", sql.slice(0, 40) + "...");
      } else {
        console.error("Failed:", sql.slice(0, 80));
        console.error(err.message);
        await pool.end();
        process.exit(1);
      }
    }
  }
  await pool.end();
  console.log("Done. Applied:", applied, "Skipped (existing):", skipped);
}

run();
