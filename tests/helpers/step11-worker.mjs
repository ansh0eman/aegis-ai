import Database from "better-sqlite3";
import { parentPort, workerData } from "node:worker_threads";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema.ts";
import { admitChatRequest } from "../../lib/chat-admission.ts";
import { provisionUsersWithAudit } from "../../lib/admin-user-transactions.ts";

const sqlite = new Database(workerData.path, { timeout: workerData.timeout ?? 2500 });
sqlite.pragma("foreign_keys = ON");
const db = drizzle(sqlite, { schema });

parentPort.postMessage({ type: "ready" });
parentPort.on("message", ({ type }) => {
  if (type !== "go") return;
  try {
    if (workerData.job === "chat") {
      const result = admitChatRequest(db, {
        userId: workerData.userId,
        message: workerData.message,
        conversationId: workerData.conversationId,
        serviceConfigured: true,
        now: new Date("2026-10-12T06:00:00.000Z"),
      });
      parentPort.postMessage({ type: "result", kind: result.kind });
    } else {
      const result = provisionUsersWithAudit(db, workerData.actorUserId, [
        {
          index: 0,
          email: workerData.email,
          passwordHash: "test-hash",
        },
      ]);
      parentPort.postMessage({
        type: "result",
        created: result.created.size,
        failures: [...result.failures.values()],
      });
    }
  } catch (error) {
    parentPort.postMessage({ type: "result", error: error.code ?? "ERROR" });
  } finally {
    sqlite.close();
    parentPort.close();
  }
});
