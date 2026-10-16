import { db } from "@/db";
import { admitDemoRequest, getTrustedDemoIpScope } from "@/lib/demo-limits";
import {
  DemoProviderError,
  getDemoInferenceConfig,
  getGroqHttpError,
  readGroqTextStream,
  requestGroqStream,
  tryAcquireDemoInferenceSlot,
  validateDemoRequestBody,
} from "@/lib/demo-inference";
import { isSameOriginMutation, sameOriginErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 8_192;

function configError(reason: string) {
  const message = reason === "unverified"
    ? "Live inference is disabled until the provider free tier is verified. Choose scripted examples instead."
    : reason === "disabled"
      ? "Live inference is currently disabled. Choose scripted examples instead."
      : "Live inference is not configured. Choose scripted examples instead.";
  return Response.json({ error: message }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function providerErrorResponse(error: DemoProviderError) {
  if (error.kind === "rate_limit") {
    return Response.json(
      { error: "The inference provider is rate-limited. Try again later or use scripted examples." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (error.kind === "timeout") {
    return Response.json(
      { error: "The inference request timed out. Try again later or use scripted examples." },
      { status: 504, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(
    { error: "The live inference provider is unavailable. Try scripted examples instead." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

async function parseBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("body_too_large");
  }
  if (!request.body) throw new Error("invalid_json");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new Error("body_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const body = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new Error("invalid_json");
  }
}

function encodeDemoEvent(event: "delta" | "done" | "error", data: Record<string, string>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();

  const configResult = getDemoInferenceConfig();
  if (!configResult.available) return configError(configResult.reason);
  const config = configResult.config;

  let body: unknown;
  try {
    body = await parseBoundedJson(request);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error && error.message === "body_too_large" ? "Request body is too large." : "Request body must be valid JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
  const validated = validateDemoRequestBody(body, config.maxPromptChars);
  if (!validated.valid) {
    return Response.json({ error: validated.error }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const releaseSlot = tryAcquireDemoInferenceSlot();
  if (!releaseSlot) {
    return Response.json(
      { error: "The demo is busy. Please try again in a moment." },
      { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "2" } },
    );
  }

  try {
    const ipScope = getTrustedDemoIpScope(
      request.headers,
      process.env.DEMO_TRUSTED_PROXY,
      process.env.AUTH_SECRET,
    );
    let admission;
    try {
      admission = admitDemoRequest(db, {
        globalDailyLimit: config.globalDailyLimit,
        perIpHourlyLimit: config.perIpHourlyLimit,
        ipScope,
      });
    } catch {
      releaseSlot();
      return Response.json(
        { error: "The demo is temporarily unavailable because its safety limits could not be checked." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!admission.admitted) {
      releaseSlot();
      return Response.json(
        { error: admission.reason === "ip_limit" ? "Demo request limit reached for this network. Try again later." : "The public demo has reached its daily request limit. Try again tomorrow." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": admission.reason === "ip_limit" ? "3600" : "86400" } },
      );
    }

    const abortController = new AbortController();
    let canceledByClient = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abortController.abort(new DemoProviderError("timeout"));
    }, config.timeoutMs);
    const onRequestAbort = () => abortController.abort();
    request.signal.addEventListener("abort", onRequestAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", onRequestAbort);
      releaseSlot();
    };

    let providerResponse: Response;
    try {
      providerResponse = await requestGroqStream(validated.prompt, config, abortController.signal);
    } catch (error) {
      cleanup();
      if (request.signal.aborted) return new Response(null, { status: 204 });
      if (abortController.signal.aborted) return providerErrorResponse(new DemoProviderError("timeout"));
      return providerErrorResponse(error instanceof DemoProviderError ? error : new DemoProviderError("unavailable"));
    }

    if (!providerResponse.ok) {
      await providerResponse.body?.cancel().catch(() => {});
      cleanup();
      return providerErrorResponse(getGroqHttpError(providerResponse.status));
    }
    if (!providerResponse.body) {
      cleanup();
      return providerErrorResponse(new DemoProviderError("invalid_stream"));
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          try {
            for await (const text of readGroqTextStream(providerResponse.body!, abortController.signal)) {
              if (canceledByClient) return;
              controller.enqueue(encoder.encode(encodeDemoEvent("delta", { text })));
            }
            if (!canceledByClient && timedOut) {
              controller.enqueue(encoder.encode(encodeDemoEvent("error", { message: "The inference request timed out. Any partial text remains only in this page." })));
            } else if (!canceledByClient && !abortController.signal.aborted) {
              controller.enqueue(encoder.encode(encodeDemoEvent("done", {})));
            }
          } catch (error) {
            if (!canceledByClient) {
              const message = error instanceof DemoProviderError && error.kind === "timeout"
                ? "The inference request timed out."
                : "The live response was interrupted. Any partial text remains only in this page.";
              try {
                controller.enqueue(encoder.encode(encodeDemoEvent("error", { message })));
              } catch {
                // The browser may have disconnected while the error was sent.
              }
            }
          } finally {
            cleanup();
            try {
              controller.close();
            } catch {
              // A canceled response body is already closed.
            }
          }
        })();
      },
      cancel() {
        canceledByClient = true;
        abortController.abort();
        cleanup();
      },
    });

    return new Response(responseStream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    releaseSlot();
    return Response.json(
      { error: "The public demo could not start a request safely." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
