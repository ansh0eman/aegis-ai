import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { normalizeEmail } from "@/lib/auth-validation";
import { verifyPassword } from "@/lib/password";
import { isSameOriginMutation, sameOriginErrorResponse } from "@/lib/request-security";
import { getPublicDemoConfig, isPublicDemoEnvironment, isPublicDemoSessionSecure } from "@/lib/public-demo";
import { admitPublicDemoLogin } from "@/lib/public-demo-login-limit";
import { db } from "@/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return sameOriginErrorResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    !("email" in body) || typeof body.email !== "string" ||
    !("password" in body) || typeof body.password !== "string" ||
    body.email.length > 254 || body.password.length > 128
  ) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  if (isPublicDemoEnvironment()) {
    if (!isPublicDemoSessionSecure()) {
      return Response.json({ error: "Secure sign-in is not configured for this demo." }, { status: 503 });
    }
    const demoConfig = getPublicDemoConfig();
    if (!demoConfig) {
      return Response.json({ error: "The public demo is not configured." }, { status: 503 });
    }
    if (!demoConfig.emails.includes(email)) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    try {
      const admission = admitPublicDemoLogin(db, email, request.headers);
      if (admission === "limited") {
        return Response.json({ error: "Too many login attempts. Please wait before trying again." }, { status: 429 });
      }
      if (admission === "unavailable") {
        return Response.json({ error: "Login protection is not configured." }, { status: 503 });
      }
    } catch {
      return Response.json({ error: "Login protection is temporarily unavailable." }, { status: 503 });
    }
  }
  try {
    const [user] = db.select().from(users).where(eq(users.email, email)).limit(1).all();
    if (!user || !(await verifyPassword(user.passwordHash, body.password))) {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    if (user.status !== "active") {
      return Response.json({ error: "Invalid email or password." }, { status: 401 });
    }
    await createSession(user.id);
    return Response.json(
      { user: { id: user.id, email: user.email } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "Login could not be completed." }, { status: 500 });
  }
}
