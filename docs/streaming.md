# Streaming

## Private OpenAI stream

The authenticated browser submits JSON to `POST /api/chat`. The route validates it, obtains a current user, checks policy and quotas, then calls `openai.responses.create()` with `stream: true` in `app/api/chat/route.ts`. The model ID currently in source is `gpt-6-luna`; access and availability depend on the configured OpenAI account and model service.

The server adapts provider events into a small application SSE protocol:

```text
event: delta
data: {"text":"Hello"}

event: done
data: {"conversationId":42}

```

`lib/chat-stream.ts` accumulates `response.output_text.delta` events and yields `delta` events immediately. It waits for a `response.completed` event before inserting exactly one assistant message. Provider error, incomplete response, malformed delta, cancellation, or a database insert failure cannot produce a success `done` event. Partial text may already have appeared in the browser, but is not stored as a complete assistant turn.

`app/chat/chat-client.tsx` reads `response.body` with a `ReadableStreamDefaultReader`, uses `TextDecoder` for bytes-to-text and `SseParser` to frame events that may be split or coalesced across network chunks. Each `delta` updates the same pending assistant message. Stop aborts the browser request; the route propagates cancellation to the OpenAI stream. Cancellation is best-effort at a network boundary and does not undo the already committed user message/usage admission.

## Stream concepts

- `ReadableStream` is a sequence of byte chunks that can be consumed before the full response is ready.
- `reader.read()` waits for the next available `{ value, done }` result; `done` marks end-of-stream.
- `TextDecoder` handles UTF-8 sequences that may be split across chunks.
- SSE is a text framing convention: blank lines terminate events; `event:` names the event; `data:` carries its payload. A network chunk is not necessarily one full SSE event.
- `TextEncoder` on the server converts the encoded SSE event string into bytes for the response stream.

## Optional live public Quick Demo

`POST /api/demo/chat` is separate. `lib/demo-inference.ts` sends a Groq-compatible streamed chat-completions request with a synthetic-demo system instruction. It parses upstream SSE, validates the completion marker, and the route emits its own delta/done/error events. It uses `GROQ_API_KEY`, not the private OpenAI credential, and requires explicit enablement plus an operator assertion that the Groq account is on the appropriate free tier. This assertion is not provider-verified by the application. Limits include bounded prompts/tokens/duration, a shared persistent daily counter, optional trusted-proxy IP cap, and two concurrent requests per process.

## Tradeoffs and failure conditions

SSE is straightforward for one-way server-to-browser text and works with the Fetch stream reader already used by the client. WebSockets would support bidirectional low-latency interaction but add protocol and lifecycle complexity not needed here. The current API is not resumable: reconnecting does not replay a generation. Provider errors and interrupted streams can leave a persisted user row without an assistant response; this is visible in conversation history and is preferable to claiming a partial generation completed.

Automated coverage: `tests/sse-parser.test.mjs` exercises byte splitting, CRLF, multiline data, completion, provider error, persistence error, and cancellation without calling OpenAI.
