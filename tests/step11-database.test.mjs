import assert from "node:assert/strict";
import test from "node:test";
import { Worker } from "node:worker_threads";
import { eq } from "drizzle-orm";
import {
  findDuplicateProvisioningEmails,
  provisionUsersWithAudit,
  updateUserStatusWithAudit,
} from "../lib/admin-user-transactions.ts";
import { admitChatRequest } from "../lib/chat-admission.ts";
import {
  createIsolatedDatabase,
  insertUser,
  schema,
} from "./helpers/sqlite.mjs";

const workerPath = new URL("./helpers/step11-worker.mjs", import.meta.url);

function launchWorker(payload) {
  const worker = new Worker(workerPath, { workerData: payload });
  let readyResolve;
  let resultResolve;
  let resultReject;
  const ready = new Promise((resolve) => (readyResolve = resolve));
  const result = new Promise((resolve, reject) => {
    resultResolve = resolve;
    resultReject = reject;
  });
  worker.on("message", (message) => {
    if (message.type === "ready") readyResolve();
    if (message.type === "result") resultResolve(message);
  });
  worker.on("error", resultReject);
  worker.on("exit", (code) => {
    if (code !== 0) resultReject(new Error(`Worker exited with code ${code}`));
  });
  return { worker, ready, result };
}

async function runCompetingWorkers(payloads) {
  const workers = payloads.map(launchWorker);
  await Promise.all(workers.map(({ ready }) => ready));
  for (const { worker } of workers) worker.postMessage({ type: "go" });
  return Promise.all(workers.map(({ result }) => result));
}

function countRows(sqlite, table, where = "1 = 1", values = []) {
  return sqlite.prepare(`SELECT count(*) AS total FROM ${table} WHERE ${where}`).get(...values).total;
}

test("independent SQLite connections admit only the final available quota slot", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const user = insertUser(testDb.db, "quota@example.com");
    const [policy] = testDb.db
      .insert(schema.aiPolicies)
      .values({ userId: user.id, maxRequestsPerDay: 100 })
      .returning({ userId: schema.aiPolicies.userId })
      .all();
    assert.equal(policy.userId, user.id);
    const [conversation] = testDb.db
      .insert(schema.conversations)
      .values({ userId: user.id })
      .returning({ id: schema.conversations.id })
      .all();
    const requestTime = new Date("2026-10-12T06:00:00.000Z");
    testDb.db
      .insert(schema.aiUsage)
      .values(Array.from({ length: 99 }, () => ({ userId: user.id, createdAt: requestTime })))
      .run();
    testDb.db
      .insert(schema.messages)
      .values(
        Array.from({ length: 99 }, (_, index) => ({
          conversationId: conversation.id,
          role: "user",
          content: `prior ${index}`,
          createdAt: requestTime,
        })),
      )
      .run();

    const results = await runCompetingWorkers(
      [1, 2].map(() => ({
        path: testDb.path,
        job: "chat",
        userId: user.id,
        conversationId: conversation.id,
        message: "competing request",
      })),
    );

    assert.deepEqual(results.map((result) => result.kind).sort(), ["accepted", "daily_limit"]);
    assert.equal(countRows(testDb.sqlite, "ai_usage", "user_id = ?", [user.id]), 100);
    assert.equal(
      countRows(testDb.sqlite, "messages", "conversation_id = ?", [conversation.id]),
      100,
    );
  } finally {
    await testDb.close();
  }
});

test("SQLite lock contention fails atomically without retry or partial message/usage", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const user = insertUser(testDb.db, "locked@example.com");
    const [conversation] = testDb.db
      .insert(schema.conversations)
      .values({ userId: user.id })
      .returning({ id: schema.conversations.id })
      .all();

    testDb.sqlite.exec("BEGIN IMMEDIATE");
    const [result] = await runCompetingWorkers([
      {
        path: testDb.path,
        job: "chat",
        timeout: 40,
        userId: user.id,
        conversationId: conversation.id,
        message: "must not be written",
      },
    ]);
    assert.equal(result.error, "SQLITE_BUSY");
    assert.equal(countRows(testDb.sqlite, "messages"), 0);
    assert.equal(countRows(testDb.sqlite, "ai_usage"), 0);
    testDb.sqlite.exec("ROLLBACK");
  } finally {
    if (testDb.sqlite.inTransaction) testDb.sqlite.exec("ROLLBACK");
    await testDb.close();
  }
});

test("provisioning handles existing and in-request duplicates and writes safe audit rows", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const actor = insertUser(testDb.db, "admin@example.com", "admin");
    insertUser(testDb.db, "existing@example.com");
    const requested = [
      { email: "existing@example.com" },
      { email: "new@example.com" },
      { email: "new@example.com" },
    ];
    const { candidates, failures } = findDuplicateProvisioningEmails(requested);
    assert.equal(failures.get(2), "duplicate_in_request");
    const result = provisionUsersWithAudit(
      testDb.db,
      actor.id,
      [
        { index: 0, email: "existing@example.com", passwordHash: "not-a-real-hash" },
        { index: 1, email: "new@example.com", passwordHash: "not-a-real-hash" },
      ].filter(({ index }) => candidates.some((candidate) => candidate.index === index)),
    );

    assert.equal(result.failures.get(0), "already_exists");
    assert.equal(result.created.get(1).role, "member");
    const audit = testDb.sqlite
      .prepare("SELECT actor_user_id, target_user_id, action, metadata FROM audit_logs")
      .get();
    assert.equal(audit.actor_user_id, actor.id);
    assert.equal(audit.target_user_id, result.created.get(1).id);
    assert.equal(audit.action, "user.provisioned");
    assert.deepEqual(JSON.parse(audit.metadata), { email: "new@example.com" });
    assert.equal(/password|hash|token|secret/i.test(audit.metadata), false);
  } finally {
    await testDb.close();
  }
});

test("concurrent provisioning of the same email creates one user and one audit", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const actor = insertUser(testDb.db, "provisioner@example.com", "admin");
    const results = await runCompetingWorkers(
      [1, 2].map(() => ({
        path: testDb.path,
        job: "provision",
        actorUserId: actor.id,
        email: "same-race@example.com",
      })),
    );
    assert.equal(results.reduce((total, result) => total + result.created, 0), 1);
    assert.equal(countRows(testDb.sqlite, "users", "email = ?", ["same-race@example.com"]), 1);
    assert.equal(
      countRows(testDb.sqlite, "audit_logs", "action = 'user.provisioned'"),
      1,
    );
  } finally {
    await testDb.close();
  }
});

test("audit failure after inserts rolls the entire bulk batch back", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const actor = insertUser(testDb.db, "rollback-admin@example.com", "admin");
    testDb.sqlite.exec(`
      CREATE TRIGGER fail_second_provision_audit BEFORE INSERT ON audit_logs
      WHEN (SELECT email FROM users WHERE id = NEW.target_user_id) = 'rollback-b@example.com'
      BEGIN SELECT RAISE(ABORT, 'test-only injected audit failure'); END;
    `);

    assert.throws(() =>
      provisionUsersWithAudit(testDb.db, actor.id, [
        { index: 0, email: "rollback-a@example.com", passwordHash: "hash-a" },
        { index: 1, email: "rollback-b@example.com", passwordHash: "hash-b" },
      ]),
    );
    assert.equal(
      countRows(testDb.sqlite, "users", "email IN (?, ?)", [
        "rollback-a@example.com",
        "rollback-b@example.com",
      ]),
      0,
    );
    assert.equal(countRows(testDb.sqlite, "audit_logs", "actor_user_id = ?", [actor.id]), 0);
  } finally {
    await testDb.close();
  }
});

test("status changes audit once, reject self-disable, and roll back if audit fails", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const admin = insertUser(testDb.db, "status-admin@example.com", "admin");
    const target = insertUser(testDb.db, "status-target@example.com");

    const disabled = updateUserStatusWithAudit(testDb.db, admin.id, target.id, "disabled");
    assert.equal(disabled.kind, "updated");
    assert.equal(disabled.user.status, "disabled");
    updateUserStatusWithAudit(testDb.db, admin.id, target.id, "disabled");
    assert.equal(countRows(testDb.sqlite, "audit_logs", "target_user_id = ?", [target.id]), 1);

    assert.equal(
      updateUserStatusWithAudit(testDb.db, admin.id, admin.id, "disabled").kind,
      "self_disable",
    );
    testDb.sqlite.exec(`
      CREATE TRIGGER fail_enabled_audit BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'user.enabled'
      BEGIN SELECT RAISE(ABORT, 'test-only injected audit failure'); END;
    `);
    assert.throws(() =>
      updateUserStatusWithAudit(testDb.db, admin.id, target.id, "active"),
    );
    const status = testDb.sqlite
      .prepare("SELECT status FROM users WHERE id = ?")
      .get(target.id).status;
    assert.equal(status, "disabled");
    assert.equal(
      countRows(testDb.sqlite, "audit_logs", "action = 'user.enabled' AND target_user_id = ?", [target.id]),
      0,
    );
  } finally {
    await testDb.close();
  }
});

test("admission rejects a user disabled after the earlier request authentication check", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const user = insertUser(testDb.db, "disabled-race@example.com");
    testDb.db.update(schema.users).set({ status: "disabled" }).where(eq(schema.users.id, user.id)).run();
    const result = admitChatRequest(testDb.db, {
      userId: user.id,
      message: "no admission",
      serviceConfigured: true,
    });
    assert.equal(result.kind, "account_disabled");
    assert.equal(countRows(testDb.sqlite, "ai_usage"), 0);
    assert.equal(countRows(testDb.sqlite, "messages"), 0);
  } finally {
    await testDb.close();
  }
});

test("migrated SQLite schema enforces foreign keys and role constraints", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    assert.equal(testDb.sqlite.pragma("foreign_keys", { simple: true }), 1);
    const [roleCheck] = testDb.sqlite
      .prepare("PRAGMA foreign_key_list(audit_logs)")
      .all();
    assert.equal(roleCheck.table, "users");
    assert.throws(() =>
      testDb.db
        .insert(schema.users)
        .values({ email: "bad-role@example.com", passwordHash: "hash", role: "owner" })
        .run(),
    );
    assert.throws(() =>
      testDb.sqlite
        .prepare(
          "INSERT INTO audit_logs (actor_user_id, action, created_at) VALUES (?, ?, ?)",
        )
        .run(99999, "user.enabled", Date.now()),
    );
  } finally {
    await testDb.close();
  }
});
