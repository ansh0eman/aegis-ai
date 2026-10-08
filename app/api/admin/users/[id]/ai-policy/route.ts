import { eq } from "drizzle-orm";
import { db } from "@/db";
import { aiPolicies, users } from "@/db/schema";
import {
  DEFAULT_AI_POLICY,
  MAX_ALLOWED_PROMPT_CHARS,
  MAX_ALLOWED_REQUESTS_PER_DAY,
  type AiPolicySettings,
} from "@/lib/ai-policy";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type PolicyPatch = Partial<
  Pick<AiPolicySettings, "aiEnabled" | "maxPromptChars" | "maxRequestsPerDay">
>;

async function getUserId(context: RouteContext) {
  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  return Number(id);
}

export async function GET(_request: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const userId = await getUserId(context);
  if (userId === null) {
    return Response.json({ error: "User ID must be a positive integer." }, { status: 400 });
  }

  const [user] = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
    .all();
  if (!user) return Response.json({ error: "User not found." }, { status: 404 });

  const [storedPolicy] = db
    .select({
      aiEnabled: aiPolicies.aiEnabled,
      maxPromptChars: aiPolicies.maxPromptChars,
      maxRequestsPerDay: aiPolicies.maxRequestsPerDay,
    })
    .from(aiPolicies)
    .where(eq(aiPolicies.userId, userId))
    .limit(1)
    .all();

  return Response.json(
    { policy: { userId, ...(storedPolicy ?? DEFAULT_AI_POLICY) } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const userId = await getUserId(context);
  if (userId === null) {
    return Response.json({ error: "User ID must be a positive integer." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const allowedFields = new Set([
    "aiEnabled",
    "maxPromptChars",
    "maxRequestsPerDay",
  ]);
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length === 0 ||
    Object.keys(body).some((key) => !allowedFields.has(key))
  ) {
    return Response.json(
      { error: "Provide at least one supported AI policy field and no unknown fields." },
      { status: 400 },
    );
  }

  const patch: PolicyPatch = {};
  if ("aiEnabled" in body) {
    if (typeof body.aiEnabled !== "boolean") {
      return Response.json({ error: "aiEnabled must be a boolean." }, { status: 400 });
    }
    patch.aiEnabled = body.aiEnabled;
  }
  if ("maxPromptChars" in body) {
    if (
      typeof body.maxPromptChars !== "number" ||
      !Number.isSafeInteger(body.maxPromptChars) ||
      body.maxPromptChars < 1 ||
      body.maxPromptChars > MAX_ALLOWED_PROMPT_CHARS
    ) {
      return Response.json(
        { error: `maxPromptChars must be an integer from 1 to ${MAX_ALLOWED_PROMPT_CHARS}.` },
        { status: 400 },
      );
    }
    patch.maxPromptChars = body.maxPromptChars;
  }
  if ("maxRequestsPerDay" in body) {
    if (
      typeof body.maxRequestsPerDay !== "number" ||
      !Number.isSafeInteger(body.maxRequestsPerDay) ||
      body.maxRequestsPerDay < 1 ||
      body.maxRequestsPerDay > MAX_ALLOWED_REQUESTS_PER_DAY
    ) {
      return Response.json(
        {
          error: `maxRequestsPerDay must be an integer from 1 to ${MAX_ALLOWED_REQUESTS_PER_DAY}.`,
        },
        { status: 400 },
      );
    }
    patch.maxRequestsPerDay = body.maxRequestsPerDay;
  }

  try {
    const result = db.transaction(
      (transaction) => {
        const [target] = transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
          .all();
        if (!target) return null;

        const [storedPolicy] = transaction
          .select({
            aiEnabled: aiPolicies.aiEnabled,
            maxPromptChars: aiPolicies.maxPromptChars,
            maxRequestsPerDay: aiPolicies.maxRequestsPerDay,
          })
          .from(aiPolicies)
          .where(eq(aiPolicies.userId, userId))
          .limit(1)
          .all();
        const before = { ...(storedPolicy ?? DEFAULT_AI_POLICY) };
        const after = { ...before, ...patch };
        const now = new Date();

        transaction
          .insert(aiPolicies)
          .values({ userId, ...after, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: aiPolicies.userId,
            set: { ...after, updatedAt: now },
          })
          .run();

        writeAuditLog(transaction, {
          actorUserId: access.user.id,
          action: "user.ai_policy_updated",
          targetUserId: userId,
          metadata: {
            aiEnabledBefore: before.aiEnabled,
            aiEnabledAfter: after.aiEnabled,
            maxPromptCharsBefore: before.maxPromptChars,
            maxPromptCharsAfter: after.maxPromptChars,
            maxRequestsPerDayBefore: before.maxRequestsPerDay,
            maxRequestsPerDayAfter: after.maxRequestsPerDay,
          },
        });

        return { userId, ...after };
      },
      { behavior: "immediate" },
    );

    if (!result) return Response.json({ error: "User not found." }, { status: 404 });
    return Response.json({ policy: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "The AI policy could not be updated." }, { status: 500 });
  }
}
