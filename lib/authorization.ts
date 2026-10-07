import "server-only";

import { getCurrentUser, type CurrentUser } from "@/lib/auth";

export type AccessResult =
  | { ok: true; user: CurrentUser }
  | { ok: false; reason: "unauthenticated" | "forbidden" };

export async function requireUser(): Promise<AccessResult> {
  const user = await getCurrentUser();
  return user ? { ok: true, user } : { ok: false, reason: "unauthenticated" };
}

export async function requireAdmin(): Promise<AccessResult> {
  const result = await requireUser();
  if (!result.ok) return result;
  return result.user.role === "admin"
    ? result
    : { ok: false, reason: "forbidden" };
}

export function accessErrorResponse(result: Extract<AccessResult, { ok: false }>) {
  return Response.json(
    {
      error:
        result.reason === "unauthenticated"
          ? "Please log in to continue."
          : "You do not have permission to access this resource.",
    },
    { status: result.reason === "unauthenticated" ? 401 : 403 },
  );
}
