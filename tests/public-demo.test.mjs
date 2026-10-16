import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";
import * as schema from "../db/schema.ts";
import { admitChatRequest } from "../lib/chat-admission.ts";
import { isPublicDemoAdmin, isPublicDemoMemberEmail, getPublicDemoConfig, getPublicDemoCredentials, isPublicDemoOpenAiEnabled, isPublicDemoSessionSecure, publicDemoDailyLimit, publicDemoOutputTokenLimit, publicDemoPromptLimit, publicDemoTimeoutMs } from "../lib/public-demo.ts";
import { admitPublicDemoLogin } from "../lib/public-demo-login-limit.ts";
import { insertUser } from "./helpers/sqlite.mjs";

const identities = {
  PUBLIC_DEMO_ADMIN_EMAIL: "demo-admin@example.test",
  PUBLIC_DEMO_USER1_EMAIL: "demo-user1@example.test",
  PUBLIC_DEMO_USER2_EMAIL: "demo-user2@example.test",
};

function demoEnvironment(databasePath, overrides = {}) {
  return {
    ...identities,
    NODE_ENV: "production",
    AEGIS_PUBLIC_DEMO_DATABASE: "true",
    AEGIS_DATABASE_PATH: databasePath,
    PUBLIC_DEMO_ACCOUNTS_ENABLED: "true",
    PUBLIC_DEMO_OPENAI_ENABLED: "false",
    ...overrides,
  };
}

test("public demo configuration fails closed and limits RBAC to the designated identities", () => {
  const valid = demoEnvironment("/data/aegis-public-demo.db");
  assert.equal(getPublicDemoConfig(valid).adminEmail, identities.PUBLIC_DEMO_ADMIN_EMAIL);
  assert.equal(getPublicDemoConfig({ ...valid, AEGIS_DATABASE_PATH: "/data/aegis.db" }), null);
  assert.equal(getPublicDemoConfig({ ...valid, PUBLIC_DEMO_USER2_EMAIL: identities.PUBLIC_DEMO_USER1_EMAIL }), null);
  assert.equal(isPublicDemoAdmin({ email: identities.PUBLIC_DEMO_ADMIN_EMAIL, role: "admin" }, valid), true);
  assert.equal(isPublicDemoAdmin({ email: identities.PUBLIC_DEMO_USER1_EMAIL, role: "admin" }, valid), false);
  assert.equal(isPublicDemoAdmin({ email: identities.PUBLIC_DEMO_USER1_EMAIL, role: "member" }, valid), false);
  assert.equal(isPublicDemoMemberEmail(identities.PUBLIC_DEMO_USER1_EMAIL, getPublicDemoConfig(valid)), true);
  assert.equal(isPublicDemoMemberEmail("owner@example.test", getPublicDemoConfig(valid)), false);
  assert.equal(isPublicDemoOpenAiEnabled(valid), false);
  assert.equal(isPublicDemoOpenAiEnabled({ ...valid, PUBLIC_DEMO_OPENAI_ENABLED: "true" }), true);
  assert.equal(isPublicDemoSessionSecure({ AUTH_COOKIE_SECURE: "true" }), true);
  assert.equal(isPublicDemoSessionSecure({ AUTH_COOKIE_SECURE: "false" }), false);
  assert.equal(publicDemoDailyLimit({ PUBLIC_DEMO_DAILY_REQUEST_LIMIT: "9999" }), 100);
  assert.equal(publicDemoPromptLimit({ PUBLIC_DEMO_MAX_PROMPT_CHARS: "9999" }), 2000);
  assert.equal(publicDemoOutputTokenLimit({ PUBLIC_DEMO_MAX_OUTPUT_TOKENS: "9999" }), 1024);
  assert.equal(publicDemoTimeoutMs({ PUBLIC_DEMO_MAX_DURATION_MS: "999999" }), 30_000);
  assert.equal(getPublicDemoCredentials({ ...valid, PUBLIC_DEMO_REVEAL_CREDENTIALS: "true" }), null);
  assert.equal(getPublicDemoCredentials({
    ...valid,
    PUBLIC_DEMO_REVEAL_CREDENTIALS: "true",
    PUBLIC_DEMO_ADMIN_PASSWORD: "a-secure-public-demo-password",
    PUBLIC_DEMO_USER1_PASSWORD: "another-secure-demo-password",
    PUBLIC_DEMO_USER2_PASSWORD: "third-secure-demo-password",
  }).length, 3);
});

test("chat admission enforces shared budget, status, quota, and conversation ownership", async () => {
  const { createIsolatedDatabase } = await import("./helpers/sqlite.mjs");
  const isolated = await createIsolatedDatabase();
  try {
    const member = insertUser(isolated.db, identities.PUBLIC_DEMO_USER1_EMAIL);
    const other = insertUser(isolated.db, "visitor@example.test");
    isolated.db.insert(schema.aiPolicies).values({ userId: member.id, aiEnabled: true, maxPromptChars: 1200, maxRequestsPerDay: 20 }).run();
    isolated.db.insert(schema.aiPolicies).values({ userId: other.id, aiEnabled: true, maxPromptChars: 1200, maxRequestsPerDay: 20 }).run();
    const now = new Date("2026-10-16T06:30:00.000Z");
    const first = admitChatRequest(isolated.db, { userId: member.id, message: "hello", serviceConfigured: true, publicDailyLimit: 1, now });
    assert.equal(first.kind, "accepted");
    const ownedConversation = first.conversationId;
    assert.equal(admitChatRequest(isolated.db, { userId: other.id, message: "read this", conversationId: ownedConversation, serviceConfigured: true, now }).kind, "not_found");
    assert.equal(admitChatRequest(isolated.db, { userId: member.id, message: "one more", conversationId: ownedConversation, serviceConfigured: true, publicDailyLimit: 1, now }).kind, "public_daily_limit");
    assert.equal(isolated.sqlite.prepare("SELECT count(*) AS count FROM messages WHERE role='user'").get().count, 1);
    isolated.db.update(schema.users).set({ status: "disabled" }).where((await import("drizzle-orm")).eq(schema.users.id, member.id)).run();
    assert.equal(admitChatRequest(isolated.db, { userId: member.id, message: "disabled", serviceConfigured: true, publicDailyLimit: 1, now }).kind, "account_disabled");
    assert.equal(isolated.sqlite.prepare("SELECT count(*) AS count FROM ai_usage").get().count, 1);
  } finally {
    await isolated.close();
  }
});

test("public demo login limits are shared, transactional, and store only hashed identities", async () => {
  const { createIsolatedDatabase } = await import("./helpers/sqlite.mjs");
  const isolated = await createIsolatedDatabase();
  try {
    const env = { AUTH_SECRET: "a-secret-that-is-long-enough-for-hmac-tests", DEMO_TRUSTED_PROXY: "railway", PUBLIC_DEMO_LOGIN_PER_EMAIL_HOURLY_LIMIT: "1", PUBLIC_DEMO_LOGIN_PER_IP_HOURLY_LIMIT: "2" };
    const headers = new Headers({ "x-real-ip": "203.0.113.44" });
    assert.equal(admitPublicDemoLogin(isolated.db, "first@example.test", headers, env, 1_800_000_000_000), "accepted");
    assert.equal(admitPublicDemoLogin(isolated.db, "first@example.test", headers, env, 1_800_000_000_001), "limited");
    assert.equal(admitPublicDemoLogin(isolated.db, "second@example.test", headers, env, 1_800_000_000_002), "accepted");
    assert.equal(admitPublicDemoLogin(isolated.db, "third@example.test", headers, env, 1_800_000_000_003), "limited");
    const rows = isolated.sqlite.prepare("SELECT scope FROM demo_request_buckets").all();
    assert.equal(rows.length, 3);
    assert.ok(rows.every(({ scope }) => !scope.includes("203.0.113.44") && !scope.includes("example.test")));
  } finally {
    await isolated.close();
  }
});

test("operator setup is isolated and idempotent; explicit reset reseeds only demo data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aegis-public-demo-"));
  const databasePath = join(directory, "aegis-public-demo.db");
  const sqlite = new Database(databasePath);
  sqlite.pragma("foreign_keys = ON");
  for (const file of (await readdir("drizzle")).filter((name) => name.endsWith(".sql")).sort()) {
    sqlite.exec(await readFile(join("drizzle", file), "utf8"));
  }
  sqlite.close();

  const env = { ...demoEnvironment(databasePath), AEGIS_PUBLIC_DEMO_DATABASE: "true" };
  try {
    const setup = spawnSync(process.execPath, [resolve("scripts/setup-public-demo.mjs")], { env, encoding: "utf8" });
    assert.equal(setup.status, 0, setup.stderr);
    assert.match(setup.stdout, /demo-admin@example\.test/);
    assert.match(setup.stdout, /password:/);
    const verify = new Database(databasePath);
    const firstHashes = verify.prepare("SELECT email, password_hash, role, status FROM users ORDER BY email").all();
    assert.equal(firstHashes.length, 3);
    assert.equal(firstHashes.filter((user) => user.role === "admin").length, 1);
    assert.ok(firstHashes.every((user) => user.password_hash.startsWith("$argon2id$")));
    assert.equal(verify.prepare("SELECT count(*) AS count FROM conversations").get().count, 3);

    const repeat = spawnSync(process.execPath, [resolve("scripts/setup-public-demo.mjs")], { env, encoding: "utf8" });
    assert.equal(repeat.status, 0, repeat.stderr);
    assert.doesNotMatch(repeat.stdout, /password:/);
    assert.deepEqual(verify.prepare("SELECT email, password_hash, role, status FROM users ORDER BY email").all(), firstHashes);

    verify.prepare("UPDATE users SET status='disabled' WHERE email=?").run(identities.PUBLIC_DEMO_USER1_EMAIL);
    verify.prepare("UPDATE ai_policies SET ai_enabled=1 WHERE user_id=(SELECT id FROM users WHERE email=?)").run(identities.PUBLIC_DEMO_USER1_EMAIL);
    verify.prepare("INSERT INTO demo_request_buckets (scope, window_start, request_count) VALUES ('public-openai', 1, 1)").run();
    const hashesBeforeReset = verify.prepare("SELECT email, password_hash FROM users ORDER BY email").all();
    verify.prepare("INSERT INTO users (email, password_hash, role, status, created_at) VALUES ('unrelated@example.test', 'hash', 'member', 'active', ?)").run(Date.now());
    verify.close();

    const wrongTarget = spawnSync(process.execPath, [resolve("scripts/reset-public-demo.mjs"), "--confirm-public-demo-reset"], { env, encoding: "utf8" });
    assert.notEqual(wrongTarget.status, 0);
    const afterRefusal = new Database(databasePath);
    assert.equal(afterRefusal.prepare("SELECT count(*) AS count FROM users").get().count, 4);
    assert.equal(afterRefusal.prepare("SELECT status FROM users WHERE email=?").get(identities.PUBLIC_DEMO_USER1_EMAIL).status, "disabled");
    afterRefusal.prepare("DELETE FROM users WHERE email='unrelated@example.test'").run();
    afterRefusal.close();

    const noConfirm = spawnSync(process.execPath, [resolve("scripts/reset-public-demo.mjs")], { env, encoding: "utf8" });
    assert.notEqual(noConfirm.status, 0);
    const reset = spawnSync(process.execPath, [resolve("scripts/reset-public-demo.mjs"), "--confirm-public-demo-reset"], { env, encoding: "utf8" });
    assert.equal(reset.status, 0, reset.stderr);
    assert.match(reset.stdout, /only the explicitly configured public demo database/);
    const afterReset = new Database(databasePath);
    assert.deepEqual(afterReset.prepare("SELECT email, password_hash FROM users ORDER BY email").all(), hashesBeforeReset);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM users WHERE status='disabled'").get().count, 0);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM users WHERE role='admin'").get().count, 1);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM ai_policies WHERE ai_enabled=1").get().count, 0);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM demo_request_buckets").get().count, 0);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM audit_logs").get().count, 0);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM conversations").get().count, 3);
    assert.equal(afterReset.prepare("SELECT count(*) AS count FROM messages WHERE content LIKE 'Seeded sample answer%' ").get().count, 3);
    afterReset.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
