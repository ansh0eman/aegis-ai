import "server-only";

import { parseSseJsonData, SseParser } from "./sse";

export const DEFAULT_DEMO_MODEL = "openai/gpt-oss-20b";
export const FREE_PLAN_MODEL_IDS = [
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.8-27b",
] as const;
export const HARD_MAX_PROMPT_CHARS = 2_000;
export const HARD_MAX_OUTPUT_TOKENS = 512;
export const HARD_MAX_DURATION_MS = 30_000;
export const MAX_CONCURRENT_DEMO_INFERENCES = 2;

export type DemoInferenceConfig = {
  apiKey: string;
  model: (typeof FREE_PLAN_MODEL_IDS)[number];
  maxPromptChars: number;
  maxOutputTokens: number;
  timeoutMs: number;
  globalDailyLimit: number;
  perIpHourlyLimit: number;
};

export type DemoConfigResult =
  | { available: true; config: DemoInferenceConfig }
  | { available: false; reason: "disabled" | "unverified" | "missing_key" | "unsupported_model" };

export class DemoProviderError extends Error {
  readonly kind: "rate_limit" | "unavailable" | "timeout" | "invalid_stream";

  constructor(kind: "rate_limit" | "unavailable" | "timeout" | "invalid_stream") {
    super(kind);
    this.name = "DemoProviderError";
    this.kind = kind;
  }
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export function getDemoInferenceConfig(
  env: Record<string, string | undefined> = process.env,
): DemoConfigResult {
  if (env.DEMO_LIVE_INFERENCE_ENABLED !== "true") {
    return { available: false, reason: "disabled" };
  }
  // This is an explicit operator assertion after checking the provider
  // account. The application cannot inspect the billing tier attached to a key.
  if (env.DEMO_GROQ_FREE_TIER_CONFIRMED !== "true") {
    return { available: false, reason: "unverified" };
  }
  if (!env.GROQ_API_KEY) return { available: false, reason: "missing_key" };

  const model = env.GROQ_MODEL || DEFAULT_DEMO_MODEL;
  if (!FREE_PLAN_MODEL_IDS.includes(model as (typeof FREE_PLAN_MODEL_IDS)[number])) {
    return { available: false, reason: "unsupported_model" };
  }

  return {
    available: true,
    config: {
      apiKey: env.GROQ_API_KEY,
      model: model as (typeof FREE_PLAN_MODEL_IDS)[number],
      maxPromptChars: boundedInteger(env.DEMO_MAX_PROMPT_CHARS, 1_200, 1, HARD_MAX_PROMPT_CHARS),
      maxOutputTokens: boundedInteger(env.DEMO_MAX_OUTPUT_TOKENS, 256, 1, HARD_MAX_OUTPUT_TOKENS),
      timeoutMs: boundedInteger(env.DEMO_MAX_DURATION_MS, 25_000, 1_000, HARD_MAX_DURATION_MS),
      globalDailyLimit: boundedInteger(env.DEMO_GLOBAL_DAILY_REQUEST_LIMIT, 60, 1, 1_000),
      perIpHourlyLimit: boundedInteger(env.DEMO_PER_IP_HOURLY_LIMIT, 5, 1, 60),
    },
  };
}

export function validateDemoPrompt(value: unknown, maxChars = 1_200) {
  if (typeof value !== "string") return { valid: false as const, error: "Prompt must be a string." };
  const prompt = value.trim();
  if (!prompt) return { valid: false as const, error: "Enter a prompt before sending." };
  if (prompt.length > maxChars) {
    return { valid: false as const, error: `Prompt must be ${maxChars} characters or fewer.` };
  }
  return { valid: true as const, prompt };
}

export function validateDemoRequestBody(value: unknown, maxChars = 1_200) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false as const, error: "Request body must be a JSON object." };
  }
  if (!("prompt" in value)) return { valid: false as const, error: "Prompt is required." };
  return validateDemoPrompt(value.prompt, maxChars);
}

export async function requestGroqStream(
  prompt: string,
  config: DemoInferenceConfig,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  const response = await fetcher("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "You are Aegis AI in a public product demo. Give concise, useful answers. Do not claim access to real accounts, policies, conversations, or audit records. Any sample enterprise details are fictional.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: config.maxOutputTokens,
      stream: true,
      service_tier: "on_demand",
    }),
    signal,
  });
  return response;
}

export async function* readGroqTextStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseParser();
  let sawDone = false;
  const onAbort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", onAbort, { once: true });

  const decodeEvents = function* (chunk: string): Generator<string> {
    for (const event of parser.feed(chunk)) {
      if (event.data === "[DONE]") {
        sawDone = true;
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = parseSseJsonData(event.data);
      } catch {
        throw new DemoProviderError("invalid_stream");
      }
      if ("error" in payload) throw new DemoProviderError("unavailable");
      const choices = payload.choices;
      if (!Array.isArray(choices)) throw new DemoProviderError("invalid_stream");
      const firstChoice = choices[0];
      if (typeof firstChoice !== "object" || firstChoice === null || !("delta" in firstChoice)) {
        continue;
      }
      const delta = firstChoice.delta;
      if (typeof delta !== "object" || delta === null || !("content" in delta)) continue;
      const content = delta.content;
      if (typeof content === "string" && content.length > 0) yield content;
    }
  };

  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      if (done) break;
      yield* decodeEvents(decoder.decode(value, { stream: true }));
      if (sawDone) break;
    }
    if (signal.aborted) return;
    yield* decodeEvents(decoder.decode());
    if (!sawDone) throw new DemoProviderError("invalid_stream");
  } catch (error) {
    if (signal.aborted) return;
    if (error instanceof DemoProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new DemoProviderError("timeout");
    }
    throw new DemoProviderError("unavailable");
  } finally {
    signal.removeEventListener("abort", onAbort);
    try {
      await reader.cancel();
    } catch {
      // The provider may already have closed or canceled this stream.
    }
    reader.releaseLock();
  }
}

export function getGroqHttpError(status: number) {
  if (status === 429) return new DemoProviderError("rate_limit");
  return new DemoProviderError("unavailable");
}

let activeInferences = 0;

export function tryAcquireDemoInferenceSlot(maximum = MAX_CONCURRENT_DEMO_INFERENCES) {
  if (activeInferences >= maximum) return null;
  activeInferences += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeInferences = Math.max(0, activeInferences - 1);
  };
}
