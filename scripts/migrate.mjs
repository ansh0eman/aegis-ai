import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const databasePath = resolve(
  process.cwd(),
  process.env.AEGIS_DATABASE_PATH ?? "aegis.db",
);
const migrationsFolder = resolve(process.cwd(), "drizzle");

mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("foreign_keys = ON");

try {
  migrate(drizzle(sqlite), { migrationsFolder });
  console.log("Database migrations are up to date.");
} finally {
  sqlite.close();
}
