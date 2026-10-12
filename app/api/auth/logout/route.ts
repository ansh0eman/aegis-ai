import { clearSession } from "@/lib/auth";
import { isSameOriginMutation, sameOriginErrorResponse } from "@/lib/request-security";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();
  await clearSession();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
