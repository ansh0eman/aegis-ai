import { asc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, type UserRole, type UserStatus } from "@/db/schema";
import { accessErrorResponse, requireAdmin } from "@/lib/authorization";
import {
  isValidEmail,
  isValidPassword,
  normalizeEmail,
} from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
const MAX_BATCH_SIZE = 50;

type ProvisionedUser = {
  email: string;
  password: string;
};

export async function GET() {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  const safeUsers = db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
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

export async function POST(request: Request) {
  const access = await requireAdmin();
  if (!access.ok) return accessErrorResponse(access);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("users" in body) ||
    !Array.isArray(body.users) ||
    body.users.length < 1 ||
    body.users.length > MAX_BATCH_SIZE
  ) {
    return Response.json(
      { error: `Provide between 1 and ${MAX_BATCH_SIZE} users.` },
      { status: 400 },
    );
  }

  const requestedUsers: ProvisionedUser[] = [];
  for (const [index, value] of body.users.entries()) {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value) ||
      !("email" in value) ||
      typeof value.email !== "string" ||
      !("password" in value) ||
      typeof value.password !== "string"
    ) {
      return Response.json(
        {
          error: `User at position ${index + 1} must include an email and password.`,
        },
        { status: 400 },
      );
    }

    const email = normalizeEmail(value.email);
    if (!isValidEmail(email)) {
      return Response.json(
        {
          error: `User at position ${index + 1} has an invalid email address.`,
        },
        { status: 400 },
      );
    }
    if (!isValidPassword(value.password)) {
      return Response.json(
        {
          error: `Password for user at position ${index + 1} must be 12–128 characters.`,
        },
        { status: 400 },
      );
    }
    requestedUsers.push({ email, password: value.password });
  }

  const failures = new Map<number, string>();
  const firstIndexByEmail = new Map<string, number>();
  const candidates: Array<{ index: number; user: ProvisionedUser }> = [];
  requestedUsers.forEach((user, index) => {
    if (firstIndexByEmail.has(user.email)) {
      failures.set(index, "duplicate_in_request");
      return;
    }
    firstIndexByEmail.set(user.email, index);
    candidates.push({ index, user });
  });

  try {
    const alreadyExisting = new Set(
      candidates.length === 0
        ? []
        : db
            .select({ email: users.email })
            .from(users)
            .where(
              inArray(
                users.email,
                candidates.map(({ user }) => user.email),
              ),
            )
            .all()
            .map((user) => user.email),
    );

    const hashedUsers: Array<{
      index: number;
      email: string;
      passwordHash: string;
    }> = [];
    for (const { index, user } of candidates) {
      if (alreadyExisting.has(user.email)) {
        failures.set(index, "already_exists");
      } else {
        hashedUsers.push({
          index,
          email: user.email,
          passwordHash: await hashPassword(user.password),
        });
      }
    }

    const created = new Map<
      number,
      {
        id: number;
        email: string;
        role: UserRole;
        status: UserStatus;
        createdAt: Date;
      }
    >();

    db.transaction((transaction) => {
      for (const user of hashedUsers) {
        const [inserted] = transaction
          .insert(users)
          .values({
            email: user.email,
            passwordHash: user.passwordHash,
            role: "member",
            status: "active",
          })
          .onConflictDoNothing({ target: users.email })
          .returning({
            id: users.id,
            email: users.email,
            role: users.role,
            status: users.status,
            createdAt: users.createdAt,
          })
          .all();

        if (inserted) created.set(user.index, inserted);
        else failures.set(user.index, "already_exists");
      }
    });

    const results = requestedUsers.map((user, index) => ({
      email: user.email,
      created: created.get(index),
      reason: failures.get(index),
    }));

    return Response.json(
      {
        created: results.flatMap((result) =>
          result.created ? [result.created] : [],
        ),
        failed: results.flatMap((result) =>
          result.reason ? [{ email: result.email, reason: result.reason }] : [],
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        error:
          "Users could not be provisioned. No users from this batch were saved.",
      },
      { status: 500 },
    );
  }
}
