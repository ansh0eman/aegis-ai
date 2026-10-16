import { db } from "@/db";
import { users, type UserStatus } from "@/db/schema";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import { updateUserStatusWithAudit } from "@/lib/admin-user-transactions";
import { isSameOriginMutation, sameOriginErrorResponse } from "@/lib/request-security";
import { getPublicDemoConfig, isPublicDemoEnvironment, isPublicDemoMemberEmail } from "@/lib/public-demo";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return Response.json({ error: "User ID must be a positive integer." }, { status: 400 });
  }
  const userId = Number(id);

  if (isPublicDemoEnvironment()) {
    const config = getPublicDemoConfig();
    const [target] = db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1).all();
    if (!config || !target || !isPublicDemoMemberEmail(target.email, config)) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !("status" in body) ||
    (body.status !== "active" && body.status !== "disabled")
  ) {
    return Response.json(
      { error: "Status must be either active or disabled." },
      { status: 400 },
    );
  }
  const requestedStatus = body.status as UserStatus;

  try {
    const result = updateUserStatusWithAudit(
      db,
      access.user.id,
      userId,
      requestedStatus,
    );

    if (result.kind === "self_disable") {
      return Response.json(
        { error: "You cannot disable your own account." },
        { status: 409 },
      );
    }
    if (result.kind === "not_found") {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    return Response.json({ user: result.user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "User status could not be updated." }, { status: 500 });
  }
}
