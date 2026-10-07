import Database from "better-sqlite3";
import { resolve } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("This local-only tool cannot run in production.");
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email || process.argv[3] !== "--local" || process.argv.length !== 4) {
  console.error("Usage: npm run db:promote-admin -- user@example.com --local");
  process.exit(1);
}

const databasePath = resolve(
  process.cwd(),
  process.env.AEGIS_DATABASE_PATH ?? "aegis.db",
);
const database = new Database(databasePath);
try {
  const result = database
    .prepare("UPDATE users SET role = 'admin' WHERE email = ?")
    .run(email);

  if (result.changes !== 1) {
    console.error("No matching local user was promoted.");
    process.exitCode = 1;
  } else {
    console.log(`Promoted ${email} to admin in the local database.`);
  }
} finally {
  database.close();
}
