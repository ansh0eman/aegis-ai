import { asc } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const safeUsers = db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.id))
    .all();

  return Response.json(
    { users: safeUsers },
    { headers: { "Cache-Control": "no-store" } },
  );
}
