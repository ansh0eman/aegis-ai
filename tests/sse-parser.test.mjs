import assert from "node:assert/strict";
import test from "node:test";
import { streamChatEvents } from "../lib/chat-stream.ts";
import { encodeSseEvent, parseSseJsonData, SseParser } from "../lib/sse.ts";

async function collect(stream) {
  const result = [];
  for await (const event of stream) result.push(event);
  return result;
}

async function* providerEvents(events) {
  for (const event of events) yield event;
}

test("SSE parser handles every-byte UTF-8 splits, CRLF, multiline data, and text newlines", () => {
  const framed = [
    encodeSseEvent({ event: "delta", data: { text: "Hello\n🌙 café" } }),
    encodeSseEvent({ event: "done", data: { conversationId: 42 } }),
  ].join("").replaceAll("\n", "\r\n");
  const bytes = new TextEncoder().encode(framed);
  const decoder = new TextDecoder();
  const parser = new SseParser();
  const events = [];

  for (const byte of bytes) {
    events.push(...parser.feed(decoder.decode(Uint8Array.of(byte), { stream: true })));
  }
  events.push(...parser.feed(decoder.decode()));

  assert.deepEqual(events.map((event) => event.event), ["delta", "done"]);
  assert.deepEqual(JSON.parse(events[0].data), { text: "Hello\n🌙 café" });
  assert.deepEqual(JSON.parse(events[1].data), { conversationId: 42 });
});

test("SSE parser handles multiple events in one chunk and joins data fields", () => {
  const parser = new SseParser();
  const events = parser.feed(
    `${encodeSseEvent({ event: "delta", data: { text: "one" } })}` +
      "event: custom\ndata: line one\ndata: line two\n\n" +
      `${encodeSseEvent({ event: "done", data: { conversationId: 7 } })}`,
  );

  assert.equal(events.length, 3);
  assert.equal(JSON.parse(events[0].data).text, "one");
  assert.equal(events[1].event, "custom");
  assert.equal(events[1].data, "line one\nline two");
  assert.equal(events[2].event, "done");
});

test("an unterminated SSE frame is not dispatched", () => {
  const parser = new SseParser();
  assert.deepEqual(parser.feed('event: done\ndata: {"conversationId":1}'), []);
});

test("malformed or non-object JSON payloads fail with a safe message", () => {
  assert.throws(() => parseSseJsonData("not-json"), /invalid data/i);
  assert.throws(() => parseSseJsonData("[]"), /invalid data/i);
});

test("successful provider completion persists before exactly one done event", async () => {
  const order = [];
  const events = [];
  for await (const event of streamChatEvents(
      providerEvents([
        { type: "response.output_text.delta", delta: "Hello" },
        { type: "response.output_text.delta", delta: " 🌍" },
        { type: "response.completed" },
      ]),
      12,
      (content) => order.push(`persist:${content}`),
      new AbortController().signal,
    )) {
    events.push(event);
    order.push(event.event);
  }

  assert.deepEqual(events.map((event) => event.event), ["delta", "delta", "done"]);
  assert.deepEqual(order, ["delta", "delta", "persist:Hello 🌍", "done"]);
  assert.equal(events.filter((event) => event.event === "done").length, 1);
  assert.deepEqual(events.at(-1), { event: "done", data: { conversationId: 12 } });
});

test("provider failure and incomplete termination emit error without persisting", async () => {
  let persistCount = 0;
  const persist = () => (persistCount += 1);
  const failed = await collect(
    streamChatEvents(
      providerEvents([
        { type: "response.output_text.delta", delta: "partial" },
        { type: "response.failed" },
      ]),
      1,
      persist,
      new AbortController().signal,
    ),
  );
  const incomplete = await collect(
    streamChatEvents(
      providerEvents([{ type: "response.output_text.delta", delta: "partial" }]),
      1,
      persist,
      new AbortController().signal,
    ),
  );

  assert.deepEqual(failed.map((event) => event.event), ["delta", "error"]);
  assert.deepEqual(incomplete.map((event) => event.event), ["delta", "error"]);
  assert.equal(persistCount, 0);
});

test("persistence failure emits error and never done", async () => {
  const events = await collect(
    streamChatEvents(
      providerEvents([
        { type: "response.output_text.delta", delta: "complete text" },
        { type: "response.completed" },
      ]),
      9,
      () => {
        throw new Error("internal database details must not escape");
      },
      new AbortController().signal,
    ),
  );

  assert.deepEqual(events.map((event) => event.event), ["delta", "error"]);
  assert.doesNotMatch(events.at(-1).data.message, /database details|internal/);
});

test("intentional cancellation keeps prior deltas but emits no error, done, or persistence", async () => {
  const controller = new AbortController();
  const events = await collect(
    streamChatEvents(
      (async function* () {
        yield { type: "response.output_text.delta", delta: "partial text" };
        controller.abort();
        yield { type: "response.completed" };
      })(),
      3,
      () => assert.fail("canceled response must not be persisted"),
      controller.signal,
    ),
  );

  assert.deepEqual(events.map((event) => event.event), ["delta"]);
});
