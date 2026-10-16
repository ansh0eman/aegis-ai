import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import test from "node:test";
import {
  DEFAULT_DEMO_MODEL,
  DemoProviderError,
  FREE_PLAN_MODEL_IDS,
  getDemoInferenceConfig,
  getGroqHttpError,
  readGroqTextStream,
  requestGroqStream,
  tryAcquireDemoInferenceSlot,
  validateDemoPrompt,
  validateDemoRequestBody,
} from "../lib/demo-inference.ts";
import { admitDemoRequest, getTrustedDemoIpScope } from "../lib/demo-limits.ts";
import { createIsolatedDatabase } from "./helpers/sqlite.mjs";

const validEnv = {
  DEMO_LIVE_INFERENCE_ENABLED: "true",
  DEMO_GROQ_FREE_TIER_CONFIRMED: "true",
  GROQ_API_KEY: "test-groq-key",
};

function launchLimitWorker(payload) {
  const worker = new Worker(new URL("./helpers/demo-limit-worker.mjs", import.meta.url), { workerData: payload });
  let readyResolve;
  let resultResolve;
  let resultReject;
  const ready = new Promise((resolve) => { readyResolve = resolve; });
  const result = new Promise((resolve, reject) => { resultResolve = resolve; resultReject = reject; });
  worker.on("message", (message) => {
    if (message.type === "ready") readyResolve();
    if (message.type === "result") resultResolve(message);
  });
  worker.on("error", resultReject);
  worker.on("exit", (code) => { if (code !== 0) resultReject(new Error(`Worker exited with code ${code}`)); });
  return { worker, ready, result };
}

test("prompt validation rejects missing, blank, non-string, and oversized input", () => {
  assert.equal(validateDemoRequestBody({}).valid, false);
  assert.equal(validateDemoRequestBody({ prompt: "  " }).valid, false);
  assert.equal(validateDemoRequestBody({ prompt: 12 }).valid, false);
  assert.equal(validateDemoPrompt("x".repeat(5), 4).valid, false);
  assert.deepEqual(validateDemoRequestBody({ prompt: "  hello  " }), { valid: true, prompt: "hello" });
});

test("provider remains disabled until both explicit opt-ins and Groq credentials exist", () => {
  assert.deepEqual(getDemoInferenceConfig({}), { available: false, reason: "disabled" });
  assert.deepEqual(getDemoInferenceConfig({ ...validEnv, DEMO_GROQ_FREE_TIER_CONFIRMED: "false" }), { available: false, reason: "unverified" });
  assert.deepEqual(getDemoInferenceConfig({ ...validEnv, GROQ_API_KEY: "" }), { available: false, reason: "missing_key" });
  assert.equal(getDemoInferenceConfig(validEnv).available, true);
  assert.equal(getDemoInferenceConfig(validEnv).config.model, DEFAULT_DEMO_MODEL);
});

test("only current Groq free-plan model IDs are selectable and OpenAI is never a fallback", () => {
  assert.ok(FREE_PLAN_MODEL_IDS.includes(DEFAULT_DEMO_MODEL));
  assert.deepEqual(getDemoInferenceConfig({ ...validEnv, GROQ_MODEL: "paid-arbitrary-model" }), { available: false, reason: "unsupported_model" });
  let requestedUrl = "";
  let requestedBody = "";
  let requestedAuthorization = "";
  const config = getDemoInferenceConfig(validEnv).config;
  return requestGroqStream("hello", config, new AbortController().signal, async (url, init) => {
    requestedUrl = String(url);
    requestedBody = String(init.body);
    requestedAuthorization = new Headers(init.headers).get("authorization") ?? "";
    return new Response(null, { status: 200 });
  }).then(() => {
    assert.equal(requestedUrl, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(requestedAuthorization, "Bearer test-groq-key");
    assert.match(requestedBody, /"stream":true/);
    assert.match(requestedBody, /"max_tokens":256/);
    assert.doesNotMatch(requestedBody, /test-groq-key|OPENAI_API_KEY/);
    assert.doesNotMatch(requestedUrl, /api\.openai\.com/);
  });
});

test("provider rate-limit errors are classified without exposing upstream bodies", () => {
  assert.equal(getGroqHttpError(429).kind, "rate_limit");
  assert.equal(getGroqHttpError(401).kind, "unavailable");
  assert.ok(getGroqHttpError(429) instanceof DemoProviderError);
});

test("Groq SSE chunks reconstruct incrementally and require the completion marker", async () => {
  const bytes = new TextEncoder().encode(
    'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
    'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
    "data: [DONE]\n\n",
  );
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 37));
      controller.enqueue(bytes.slice(37));
      controller.close();
    },
  });
  const output = [];
  for await (const chunk of readGroqTextStream(source, new AbortController().signal)) output.push(chunk);
  assert.deepEqual(output, ["Hello ", "world"]);

  const incomplete = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
      controller.close();
    },
  });
  await assert.rejects(async () => {
    const iterator = readGroqTextStream(incomplete, new AbortController().signal);
    while (!(await iterator.next()).done) { /* consume */ }
  }, (error) => error instanceof DemoProviderError && error.kind === "invalid_stream");
});

test("canceling the consumer cancels the upstream stream", async () => {
  let canceled = false;
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
    },
    cancel() { canceled = true; },
  });
  const controller = new AbortController();
  const iterator = readGroqTextStream(source, controller.signal);
  assert.deepEqual(await iterator.next(), { value: "first", done: false });
  controller.abort();
  assert.equal((await iterator.next()).done, true);
  assert.equal(canceled, true);
});

test("in-process concurrent inference is bounded and releases slots once", () => {
  const releases = [tryAcquireDemoInferenceSlot(2), tryAcquireDemoInferenceSlot(2)];
  assert.ok(releases.every(Boolean));
  assert.equal(tryAcquireDemoInferenceSlot(2), null);
  releases[0]();
  releases[0]();
  const next = tryAcquireDemoInferenceSlot(2);
  assert.ok(next);
  releases[1]();
  next();
});

test("global and trusted per-IP limits are persisted in the isolated demo table", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const originalCounts = ["users", "messages", "conversations", "audit_logs", "ai_policies"]
      .map((table) => testDb.sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get().total);
    const headers = new Headers({ "x-real-ip": "203.0.113.10" });
    const ipScope = getTrustedDemoIpScope(headers, "railway", "hmac-test-secret");
    assert.ok(ipScope);
    assert.doesNotMatch(ipScope, /203\.0\.113\.10/);
    assert.equal(getTrustedDemoIpScope(headers, "off", "hmac-test-secret"), null);

    assert.equal(admitDemoRequest(testDb.db, { now: 1_800_000_000_000, globalDailyLimit: 2, perIpHourlyLimit: 1, ipScope }).admitted, true);
    assert.equal(admitDemoRequest(testDb.db, { now: 1_800_000_000_001, globalDailyLimit: 2, perIpHourlyLimit: 1, ipScope }).reason, "ip_limit");
    assert.equal(admitDemoRequest(testDb.db, { now: 1_800_000_000_002, globalDailyLimit: 1, perIpHourlyLimit: 5, ipScope: null }).reason, "global_limit");
    const demoRows = testDb.sqlite.prepare("SELECT scope, window_start, request_count FROM demo_request_buckets").all();
    assert.equal(demoRows.length, 2);
    assert.deepEqual(originalCounts, ["users", "messages", "conversations", "audit_logs", "ai_policies"]
      .map((table) => testDb.sqlite.prepare(`SELECT count(*) AS total FROM ${table}`).get().total));
  } finally {
    await testDb.close();
  }
});

test("two independent SQLite connections cannot both claim the final global budget slot", async () => {
  const testDb = await createIsolatedDatabase();
  try {
    const workers = [1, 2].map(() => launchLimitWorker({
      path: testDb.path,
      now: 1_800_000_000_000,
      globalDailyLimit: 1,
    }));
    await Promise.all(workers.map((worker) => worker.ready));
    for (const { worker } of workers) worker.postMessage({ type: "go" });
    const results = await Promise.all(workers.map((worker) => worker.result));
    assert.deepEqual(results.map((result) => result.admitted).sort(), [false, true]);
    assert.equal(testDb.sqlite.prepare("SELECT sum(request_count) AS total FROM demo_request_buckets WHERE scope = 'global'").get().total, 1);
  } finally {
    await testDb.close();
  }
});
