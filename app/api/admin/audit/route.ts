import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import { getRecentAuditLogs } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  return Response.json(
    { events: getRecentAuditLogs() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
