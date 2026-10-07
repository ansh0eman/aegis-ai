import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { UserStatus } from "@/db/schema";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const { id } = await context.params;
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
    return Response.json({ error: "User ID must be a positive integer." }, { status: 400 });
  }
  const userId = Number(id);

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

  if (userId === access.user.id && requestedStatus === "disabled") {
    return Response.json(
      { error: "You cannot disable your own account." },
      { status: 409 },
    );
  }

  try {
    const user = db.transaction((transaction) => {
      const [currentUser] = transaction
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
        .all();

      if (!currentUser) return null;

      const [updatedUser] = transaction
        .update(users)
        .set({ status: requestedStatus })
        .where(eq(users.id, userId))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          createdAt: users.createdAt,
        })
        .all();

      if (updatedUser && currentUser.status !== updatedUser.status) {
        writeAuditLog(transaction, {
          actorUserId: access.user.id,
          action:
            updatedUser.status === "disabled"
              ? "user.disabled"
              : "user.enabled",
          targetUserId: updatedUser.id,
          metadata: {
            from: currentUser.status,
            to: updatedUser.status,
          },
        });
      }

      return updatedUser ?? null;
    });

    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "User status could not be updated." }, { status: 500 });
  }
}
