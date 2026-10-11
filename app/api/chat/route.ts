import OpenAI from "openai";
import { and, count, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { aiPolicies, aiUsage, conversations, messages } from "@/db/schema";
import { streamChatEvents } from "@/lib/chat-stream";
import { DEFAULT_AI_POLICY, getEffectiveAiPolicy } from "@/lib/ai-policy";
import { encodeSseEvent } from "@/lib/sse";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_PREVIOUS_MESSAGES = 12;

type PromptMessage = {
  role: "user" | "assistant";
  content: string;
};

type AdmissionResult =
  | { kind: "accepted"; conversationId: number; history: PromptMessage[] }
  | { kind: "not_found" }
  | { kind: "ai_disabled" }
  | { kind: "prompt_too_long"; maxPromptChars: number }
  | { kind: "daily_limit"; maxRequestsPerDay: number }
  | { kind: "service_not_configured" };

function policyResponse(result: AdmissionResult) {
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
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: "Please log in to use the workspace." },
      { status: 401 },
    );
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
  if (message.length > initialPolicy.maxPromptChars) {
    return Response.json(
      { error: `Message must be ${initialPolicy.maxPromptChars} characters or fewer.` },
      { status: 400 },
    );
  }

  let apiKey: string | undefined;
  let admission: AdmissionResult;
  try {
    admission = db.transaction(
      (transaction): AdmissionResult => {
        // Re-read inside the immediate transaction so a concurrent admin policy
        // update cannot slip between the initial check and request admission.
        const [storedPolicy] = transaction
          .select({
            aiEnabled: aiPolicies.aiEnabled,
            maxPromptChars: aiPolicies.maxPromptChars,
            maxRequestsPerDay: aiPolicies.maxRequestsPerDay,
          })
          .from(aiPolicies)
          .where(eq(aiPolicies.userId, user.id))
          .limit(1)
          .all();
        const policy = storedPolicy ?? DEFAULT_AI_POLICY;

        if (!policy.aiEnabled) return { kind: "ai_disabled" };
        if (message.length > policy.maxPromptChars) {
          return { kind: "prompt_too_long", maxPromptChars: policy.maxPromptChars };
        }

        let history: PromptMessage[] = [];
        let activeConversationId: number | undefined;
        if (conversationId !== undefined) {
          const [conversation] = transaction
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.id, conversationId),
                eq(conversations.userId, user.id),
              ),
            )
            .limit(1)
            .all();
          if (!conversation) return { kind: "not_found" };

          activeConversationId = conversation.id;
          history = transaction
            .select({ role: messages.role, content: messages.content })
            .from(messages)
            .where(eq(messages.conversationId, conversation.id))
            .orderBy(desc(messages.id))
            .limit(MAX_PREVIOUS_MESSAGES)
            .all()
            .reverse();
        }

        const now = new Date();
        const utcStart = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const nextUtcStart = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
        const [usage] = transaction
          .select({ requests: count() })
          .from(aiUsage)
          .where(
            and(
              eq(aiUsage.userId, user.id),
              gte(aiUsage.createdAt, utcStart),
              lt(aiUsage.createdAt, nextUtcStart),
            ),
          )
          .all();
        if ((usage?.requests ?? 0) >= policy.maxRequestsPerDay) {
          return {
            kind: "daily_limit",
            maxRequestsPerDay: policy.maxRequestsPerDay,
          };
        }

        apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return { kind: "service_not_configured" };

        if (activeConversationId === undefined) {
          const [conversation] = transaction
            .insert(conversations)
            .values({ userId: user.id })
            .returning({ id: conversations.id })
            .all();
          activeConversationId = conversation.id;
        }

        transaction
          .insert(messages)
          .values({
            conversationId: activeConversationId,
            role: "user",
            content: message,
          })
          .run();
        transaction.insert(aiUsage).values({ userId: user.id, createdAt: now }).run();

        return {
          kind: "accepted",
          conversationId: activeConversationId,
          history,
        };
      },
      { behavior: "immediate" },
    );
  } catch {
    return Response.json(
      { error: "The request could not be prepared." },
      { status: 500 },
    );
  }

  const rejection = policyResponse(admission);
  if (rejection) return rejection;
  if (admission.kind !== "accepted") {
    return Response.json({ error: "The request could not be prepared." }, { status: 500 });
  }

  if (!apiKey) {
    return Response.json(
      { error: "The AI service is not configured on the server." },
      { status: 500 },
    );
  }

  const activeConversationId = admission.conversationId;

  const upstreamAbortController = new AbortController();
  let clientCancelled = false;
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
    return new Response(null, { status: 204 });
  }

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
        } catch {
          send({
            event: "error",
            data: {
              message: "The AI service is unavailable. Please try again.",
            },
          });
        } finally {
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
