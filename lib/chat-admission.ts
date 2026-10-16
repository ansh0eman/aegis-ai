import "server-only";

import { and, count, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  aiPolicies,
  aiUsage,
  conversations,
  demoRequestBuckets,
  messages,
  users,
} from "../db/schema";

const MAX_PREVIOUS_MESSAGES = 12;
const DEFAULT_AI_POLICY = {
  aiEnabled: true,
  maxPromptChars: 4000,
  maxRequestsPerDay: 100,
} as const;

type PromptMessage = { role: "user" | "assistant"; content: string };

export type ChatAdmissionResult =
  | { kind: "accepted"; conversationId: number; history: PromptMessage[] }
  | { kind: "not_found" }
  | { kind: "account_disabled" }
  | { kind: "ai_disabled" }
  | { kind: "prompt_too_long"; maxPromptChars: number }
  | { kind: "daily_limit"; maxRequestsPerDay: number }
  | { kind: "public_daily_limit"; maxRequestsPerDay: number }
  | { kind: "service_not_configured" };

type AdmissionDatabase = BetterSQLite3Database<typeof schema>;

export function admitChatRequest(
  database: AdmissionDatabase,
  input: {
    userId: number;
    message: string;
    conversationId?: number;
    serviceConfigured: boolean;
    publicDailyLimit?: number;
    now?: Date;
  },
): ChatAdmissionResult {
  return database.transaction(
    (transaction): ChatAdmissionResult => {
      // Revalidate the user's active status and policy under the same write lock
      // as quota admission, so concurrent disable/policy changes cannot race it.
      const [account] = transaction
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1)
        .all();
      if (!account || account.status !== "active") {
        return { kind: "account_disabled" };
      }

      const [storedPolicy] = transaction
        .select({
          aiEnabled: aiPolicies.aiEnabled,
          maxPromptChars: aiPolicies.maxPromptChars,
          maxRequestsPerDay: aiPolicies.maxRequestsPerDay,
        })
        .from(aiPolicies)
        .where(eq(aiPolicies.userId, input.userId))
        .limit(1)
        .all();
      const policy = storedPolicy ?? DEFAULT_AI_POLICY;

      if (!policy.aiEnabled) return { kind: "ai_disabled" };
      if (input.message.length > policy.maxPromptChars) {
        return {
          kind: "prompt_too_long",
          maxPromptChars: policy.maxPromptChars,
        };
      }

      let history: PromptMessage[] = [];
      let activeConversationId: number | undefined;
      if (input.conversationId !== undefined) {
        const [conversation] = transaction
          .select({ id: conversations.id })
          .from(conversations)
          .where(
            and(
              eq(conversations.id, input.conversationId),
              eq(conversations.userId, input.userId),
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

      const now = input.now ?? new Date();
      const utcStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      const nextUtcStart = new Date(utcStart.getTime() + 24 * 60 * 60 * 1000);
      const [usage] = transaction
        .select({ requests: count() })
        .from(aiUsage)
        .where(
          and(
            eq(aiUsage.userId, input.userId),
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

      if (!input.serviceConfigured) return { kind: "service_not_configured" };

      if (input.publicDailyLimit !== undefined) {
        const publicStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        transaction.delete(demoRequestBuckets)
          .where(lt(demoRequestBuckets.windowStart, publicStart - 7 * 24 * 60 * 60 * 1000))
          .run();
        const [publicUsage] = transaction
          .select({ requests: demoRequestBuckets.requestCount })
          .from(demoRequestBuckets)
          .where(and(
            eq(demoRequestBuckets.scope, "public-openai"),
            eq(demoRequestBuckets.windowStart, publicStart),
          ))
          .limit(1)
          .all();
        if ((publicUsage?.requests ?? 0) >= input.publicDailyLimit) {
          return { kind: "public_daily_limit", maxRequestsPerDay: input.publicDailyLimit };
        }
        transaction
          .insert(demoRequestBuckets)
          .values({ scope: "public-openai", windowStart: publicStart, requestCount: 1 })
          .onConflictDoUpdate({
            target: [demoRequestBuckets.scope, demoRequestBuckets.windowStart],
            set: { requestCount: sql`${demoRequestBuckets.requestCount} + 1` },
          })
          .run();
      }

      if (activeConversationId === undefined) {
        const [conversation] = transaction
          .insert(conversations)
          .values({ userId: input.userId })
          .returning({ id: conversations.id })
          .all();
        activeConversationId = conversation.id;
      }

      transaction
        .insert(messages)
        .values({
          conversationId: activeConversationId,
          role: "user",
          content: input.message,
        })
        .run();
      transaction
        .insert(aiUsage)
        .values({ userId: input.userId, createdAt: now })
        .run();

      return {
        kind: "accepted",
        conversationId: activeConversationId,
        history,
      };
    },
    { behavior: "immediate" },
  );
}
