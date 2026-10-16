import { inArray } from "drizzle-orm";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import { getRecentAuditLogs } from "@/lib/audit";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getPublicDemoConfig, isPublicDemoEnvironment } from "@/lib/public-demo";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const demoConfig = getPublicDemoConfig();
  if (isPublicDemoEnvironment() && !demoConfig) {
    return Response.json({ error: "Public demo administration is misconfigured." }, { status: 503 });
  }
  const userIds = demoConfig
    ? db.select({ id: users.id }).from(users).where(inArray(users.email, demoConfig.emails)).all().map(({ id }) => id)
    : undefined;

  return Response.json(
    { events: getRecentAuditLogs(userIds) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
