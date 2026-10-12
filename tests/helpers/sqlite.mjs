import Database from "better-sqlite3";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.ts";

const migrationsDirectory = resolve("drizzle");

export async function createIsolatedDatabase() {
  const directory = await mkdtemp(join(tmpdir(), "aegis-step11-"));
  const path = join(directory, "test.db");
  const sqlite = new Database(path, { timeout: 500 });
  sqlite.pragma("foreign_keys = ON");

  const migrations = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    sqlite.exec(await readFile(join(migrationsDirectory, migration), "utf8"));
  }
  sqlite.pragma("foreign_keys = ON");

  return {
    path,
    sqlite,
    db: drizzle(sqlite, { schema }),
    async close() {
      sqlite.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export function insertUser(db, email, role = "member", status = "active") {
  const [user] = db
    .insert(schema.users)
    .values({ email, passwordHash: "test-hash", role, status })
    .returning({ id: schema.users.id, email: schema.users.email })
    .all();
  return user;
}

export { schema };
