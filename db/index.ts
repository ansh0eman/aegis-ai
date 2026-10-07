import "server-only";

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const globalForDatabase = globalThis as typeof globalThis & {
  aegisSqlite?: Database.Database;
};

const sqlite =
  globalForDatabase.aegisSqlite ??
  new Database(
    resolve(process.cwd(), process.env.AEGIS_DATABASE_PATH ?? "aegis.db"),
  );

sqlite.pragma("foreign_keys = ON");
globalForDatabase.aegisSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
