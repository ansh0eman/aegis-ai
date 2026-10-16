import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.ts";
import { admitDemoRequest } from "../../lib/demo-limits.ts";

const sqlite = new Database(workerData.path, { timeout: 2_500 });
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

parentPort.postMessage({ type: "ready" });
parentPort.on("message", ({ type }) => {
  if (type !== "go") return;
  try {
    const result = admitDemoRequest(db, {
      now: workerData.now,
      globalDailyLimit: workerData.globalDailyLimit,
      perIpHourlyLimit: 10,
      ipScope: null,
    });
    parentPort.postMessage({ type: "result", admitted: result.admitted });
  } catch {
    parentPort.postMessage({ type: "result", error: "failed_closed" });
  } finally {
    sqlite.close();
    parentPort.close();
  }
});
