import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession } from "@/lib/auth";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null || Array.isArray(body) ||
    !("email" in body) || typeof body.email !== "string" ||
    !("password" in body) || typeof body.password !== "string"
  ) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return Response.json({ error: "Password must be 12–128 characters." }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const [user] = db
      .insert(users)
      .values({ email, passwordHash, role: "member" })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email })
      .all();

    if (!user) {
      return Response.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    await createSession(user.id);
    return Response.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Registration could not be completed." }, { status: 500 });
  }
}
