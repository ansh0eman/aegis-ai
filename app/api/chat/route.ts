import OpenAI from "openai";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { streamChatEvents } from "@/lib/chat-stream";
import { admitChatRequest, type ChatAdmissionResult } from "@/lib/chat-admission";
import { getEffectiveAiPolicy } from "@/lib/ai-policy";
import { encodeSseEvent } from "@/lib/sse";
import { getCurrentUser } from "@/lib/auth";
import { isSameOriginMutation, sameOriginErrorResponse } from "@/lib/request-security";
import { getPublicDemoConfig, isPublicDemoEnvironment, isPublicDemoOpenAiEnabled, publicDemoDailyLimit, publicDemoOutputTokenLimit, publicDemoPromptLimit, publicDemoTimeoutMs } from "@/lib/public-demo";
import { tryAcquireDemoInferenceSlot } from "@/lib/demo-inference";

export const runtime = "nodejs";

function policyResponse(result: ChatAdmissionResult) {
  if (result.kind === "account_disabled") {
    return Response.json(
      { error: "Please log in to use the workspace." },
      { status: 401 },
    );
  }
  if (result.kind === "ai_disabled") {
    return Response.json(
      { error: "AI access is disabled for your account." },
      { status: 403 },
    );
  }
  if (result.kind === "prompt_too_long") {
    return Response.json(
      { error: `Message must be ${result.maxPromptChars} characters or fewer.` },
      { status: 400 },
    );
  }
  if (result.kind === "daily_limit") {
    return Response.json(
      { error: "You have reached your AI request limit for today." },
      { status: 429 },
    );
  }
  if (result.kind === "public_daily_limit") {
    return Response.json(
      { error: "The shared demo has reached its daily AI request limit. Please try again tomorrow." },
      { status: 429 },
    );
  }
  if (result.kind === "not_found") {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }
  if (result.kind === "service_not_configured") {
    return Response.json(
      { error: "The AI service is not configured on the server." },
      { status: 500 },
    );
  }
  return null;
}

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();

  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Please log in to use the workspace." },
      { status: 401 },
    );
  }

  const demoConfig = getPublicDemoConfig();
  const publicDemoEnvironment = isPublicDemoEnvironment();
  if (publicDemoEnvironment && !demoConfig) {
    return Response.json({ error: "The public demo is not configured." }, { status: 503 });
  }
  const isPublicDemoAccount = Boolean(demoConfig?.emails.includes(user.email));
  if (publicDemoEnvironment && !isPublicDemoAccount) {
    return Response.json({ error: "This account is not enabled for the public demo." }, { status: 403 });
  }
  if (isPublicDemoAccount && !isPublicDemoOpenAiEnabled()) {
    return Response.json({ error: "Live AI is not enabled for the shared demo." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("message" in body) ||
    typeof body.message !== "string" ||
    body.message.trim().length === 0
  ) {
    return Response.json(
      { error: "Message must be a non-empty string." },
      { status: 400 },
    );
  }

  const conversationId = "conversationId" in body ? body.conversationId : undefined;
  if (
    conversationId !== undefined &&
    (typeof conversationId !== "number" ||
      !Number.isSafeInteger(conversationId) ||
      conversationId <= 0)
  ) {
    return Response.json(
      { error: "Conversation ID must be a positive integer." },
      { status: 400 },
    );
  }

  const message = body.message.trim();

  let initialPolicy;
  try {
    initialPolicy = getEffectiveAiPolicy(user.id);
  } catch {
    return Response.json({ error: "AI policy could not be loaded." }, { status: 500 });
  }
  if (!initialPolicy.aiEnabled) {
    return Response.json(
      { error: "AI access is disabled for your account." },
      { status: 403 },
    );
  }
  const maxPromptChars = isPublicDemoAccount
    ? Math.min(initialPolicy.maxPromptChars, publicDemoPromptLimit())
    : initialPolicy.maxPromptChars;
  if (message.length > maxPromptChars) {
    return Response.json(
      { error: `Message must be ${maxPromptChars} characters or fewer.` },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const releaseDemoInferenceSlot = isPublicDemoAccount ? tryAcquireDemoInferenceSlot() : null;
  if (isPublicDemoAccount && !releaseDemoInferenceSlot) {
    return Response.json({ error: "The shared demo is busy. Please try again shortly." }, { status: 429 });
  }
  let admission: ChatAdmissionResult;
  try {
    admission = admitChatRequest(db, {
      userId: user.id,
      message,
      conversationId,
      serviceConfigured: Boolean(apiKey),
      publicDailyLimit: isPublicDemoAccount ? publicDemoDailyLimit() : undefined,
    });
  } catch {
    releaseDemoInferenceSlot?.();
    return Response.json(
      { error: "The request could not be prepared." },
      { status: 500 },
    );
  }

  const rejection = policyResponse(admission);
  if (rejection) {
    releaseDemoInferenceSlot?.();
    return rejection;
  }
  if (admission.kind !== "accepted") {
    releaseDemoInferenceSlot?.();
    return Response.json({ error: "The request could not be prepared." }, { status: 500 });
  }

  if (!apiKey) {
    releaseDemoInferenceSlot?.();
    return Response.json({ error: "The AI service is not configured on the server." }, { status: 500 });
  }

  const activeConversationId = admission.conversationId;

  const upstreamAbortController = new AbortController();
  let clientCancelled = false;
  let timedOut = false;
  type AbortableProviderStream = AsyncIterable<{
    type: string;
    delta?: unknown;
  }> & { controller: AbortController };
  let openAIStream: AbortableProviderStream | undefined;
  const cancelUpstream = () => {
    clientCancelled = true;
    if (!upstreamAbortController.signal.aborted) {
      upstreamAbortController.abort();
    }
    openAIStream?.controller.abort();
  };
  const removeRequestAbortListener = () => {
    request.signal.removeEventListener("abort", cancelUpstream);
  };
  request.signal.addEventListener("abort", cancelUpstream, { once: true });

  if (request.signal.aborted) {
    cancelUpstream();
    removeRequestAbortListener();
    releaseDemoInferenceSlot?.();
    return new Response(null, { status: 204 });
  }

  const publicDemoTimeout = isPublicDemoAccount
    ? setTimeout(() => {
        timedOut = true;
        upstreamAbortController.abort();
      }, publicDemoTimeoutMs())
    : null;

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    start(controller) {
      void (async () => {
        const send = (event: Parameters<typeof encodeSseEvent>[0]) => {
          if (clientCancelled) return false;
          try {
            controller.enqueue(encoder.encode(encodeSseEvent(event)));
            return true;
          } catch {
            cancelUpstream();
            return false;
          }
        };

        try {
          const openai = new OpenAI({ apiKey });
          openAIStream = (await openai.responses.create(
            {
              model: "gpt-6-luna",
              input: [...admission.history, { role: "user", content: message }],
              stream: true,
              ...(isPublicDemoAccount
                ? { max_output_tokens: publicDemoOutputTokenLimit() }
                : {}),
            },
            { signal: upstreamAbortController.signal },
          )) as AbortableProviderStream;

          if (clientCancelled || upstreamAbortController.signal.aborted) return;

          for await (const event of streamChatEvents(
            openAIStream,
            activeConversationId,
            (content) => {
              db.insert(messages)
                .values({
                  conversationId: activeConversationId,
                  role: "assistant",
                  content,
                })
                .run();
            },
            upstreamAbortController.signal,
          )) {
            if (!send(event)) return;
          }
          if (timedOut && !clientCancelled) {
            send({ event: "error", data: { message: "The shared demo request timed out. Please try again." } });
          }
        } catch {
          send({
            event: "error",
            data: {
              message: timedOut
                ? "The shared demo request timed out. Please try again."
                : "The AI service is unavailable. Please try again.",
            },
          });
        } finally {
          if (publicDemoTimeout) clearTimeout(publicDemoTimeout);
          releaseDemoInferenceSlot?.();
          removeRequestAbortListener();
          try {
            controller.close();
          } catch {
            // A canceled response body is already closed from the browser's side.
          }
        }
      })();
    },
    cancel() {
      cancelUpstream();
      removeRequestAbortListener();
    },
  });

  return new Response(responseStream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Conversation-Id": String(activeConversationId),
    },
  });
}
