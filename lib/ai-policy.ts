import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiPolicies } from "@/db/schema";

export const DEFAULT_AI_POLICY = {
  aiEnabled: true,
  maxPromptChars: 4000,
  maxRequestsPerDay: 100,
} as const;

export const MAX_ALLOWED_PROMPT_CHARS = 20000;
export const MAX_ALLOWED_REQUESTS_PER_DAY = 1000;

export type AiPolicySettings = {
  userId: number;
  aiEnabled: boolean;
  maxPromptChars: number;
  maxRequestsPerDay: number;
};

export function getEffectiveAiPolicy(userId: number): AiPolicySettings {
  const [policy] = db
    .select({
      aiEnabled: aiPolicies.aiEnabled,
      maxPromptChars: aiPolicies.maxPromptChars,
      maxRequestsPerDay: aiPolicies.maxRequestsPerDay,
    })
    .from(aiPolicies)
    .where(eq(aiPolicies.userId, userId))
    .limit(1)
    .all();

  return { userId, ...(policy ?? DEFAULT_AI_POLICY) };
}
