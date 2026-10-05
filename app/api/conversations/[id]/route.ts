import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!/^[1-9]\d*$/.test(id)) {
    return Response.json(
      { error: "Conversation ID must be a positive integer." },
      { status: 400 },
    );
  }

  const conversationId = Number(id);

  if (!Number.isSafeInteger(conversationId)) {
    return Response.json(
      { error: "Conversation ID must be a positive integer." },
      { status: 400 },
    );
  }

  try {
    const [conversation] = db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
      .all();

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    const conversationMessages = db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.id))
      .all();

    return Response.json(
      { conversationId: conversation.id, messages: conversationMessages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "The conversation could not be loaded." },
      { status: 500 },
    );
  }
}
