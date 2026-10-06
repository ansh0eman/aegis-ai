import OpenAI from "openai";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_PREVIOUS_MESSAGES = 12;

type PromptMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Please log in to use the workspace." }, { status: 401 });
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
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return Response.json(
      { error: "The AI service is not configured on the server." },
      { status: 500 },
    );
  }

  let activeConversationId: number;
  let previousMessages: PromptMessage[] = [];

  try {
    if (conversationId === undefined) {
      activeConversationId = db.transaction((transaction) => {
        const conversation = transaction
          .insert(conversations)
          .values({ userId: user.id })
          .returning({ id: conversations.id })
          .get();

        transaction
          .insert(messages)
          .values({
            conversationId: conversation.id,
            role: "user",
            content: message,
          })
          .run();

        return conversation.id;
      });
    } else {
      const existingConversation = db.transaction((transaction) => {
        const [conversation] = transaction
          .select({ id: conversations.id })
          .from(conversations)
          .where(and(eq(conversations.id, conversationId), eq(conversations.userId, user.id)))
          .limit(1)
          .all();

        if (!conversation) {
          return null;
        }

        const history = transaction
          .select({ role: messages.role, content: messages.content })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .orderBy(desc(messages.id))
          .limit(MAX_PREVIOUS_MESSAGES)
          .all()
          .reverse();

        transaction
          .insert(messages)
          .values({
            conversationId,
            role: "user",
            content: message,
          })
          .run();

        return { id: conversation.id, history };
      });

      if (!existingConversation) {
        return Response.json(
          { error: "Conversation not found." },
          { status: 404 },
        );
      }

      activeConversationId = existingConversation.id;
      previousMessages = existingConversation.history;
    }
  } catch {
    return Response.json(
      { error: "The conversation could not be saved." },
      { status: 500 },
    );
  }

  try {
    const openai = new OpenAI({ apiKey });
    const openAIStream = await openai.responses.create({
      model: "gpt-6-luna",
      input: [
        ...previousMessages,
        { role: "user", content: message },
      ],
      stream: true,
    });

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          let assistantText = "";

          try {
            for await (const event of openAIStream) {
              if (event.type === "response.output_text.delta") {
                assistantText += event.delta;
                controller.enqueue(encoder.encode(event.delta));
              } else if (
                event.type === "error" ||
                event.type === "response.failed" ||
                event.type === "response.incomplete"
              ) {
                controller.error(new Error("The AI response stream failed."));
                return;
              }
            }

            db.insert(messages)
              .values({
                conversationId: activeConversationId,
                role: "assistant",
                content: assistantText,
              })
              .run();

            controller.close();
          } catch {
            controller.error(new Error("The AI response stream failed."));
          }
        })();
      },
    });

    return new Response(responseStream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "text/plain; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Conversation-Id": String(activeConversationId),
      },
    });
  } catch {
    return Response.json(
      { error: "The AI service is unavailable. Please try again." },
      {
        status: 502,
        headers: { "X-Conversation-Id": String(activeConversationId) },
      },
    );
  }
}
