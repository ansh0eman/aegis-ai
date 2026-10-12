import "server-only";

import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { users, type UserStatus } from "../db/schema";
import { writeAuditLog } from "./audit-write";

type AdminDatabase = BetterSQLite3Database<typeof schema>;

export type ProvisioningCandidate = { index: number; email: string };

export function findDuplicateProvisioningEmails(
  usersToProvision: Array<{ email: string }>,
) {
  const failures = new Map<number, string>();
  const candidates: ProvisioningCandidate[] = [];
  const firstIndexByEmail = new Set<string>();

  usersToProvision.forEach((user, index) => {
    if (firstIndexByEmail.has(user.email)) {
      failures.set(index, "duplicate_in_request");
      return;
    }
    firstIndexByEmail.add(user.email);
    candidates.push({ index, email: user.email });
  });

  return { candidates, failures };
}

export function provisionUsersWithAudit(
  database: AdminDatabase,
  actorUserId: number,
  hashedUsers: Array<{ index: number; email: string; passwordHash: string }>,
) {
  const created = new Map<
    number,
    {
      id: number;
      email: string;
      role: "admin" | "member";
      status: "active" | "disabled";
      createdAt: Date;
    }
  >();
  const failures = new Map<number, string>();

  database.transaction((transaction) => {
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

      if (inserted) {
        created.set(user.index, inserted);
        writeAuditLog(transaction, {
          actorUserId,
          action: "user.provisioned",
          targetUserId: inserted.id,
          metadata: { email: inserted.email },
        });
      } else {
        failures.set(user.index, "already_exists");
      }
    }
  });

  return { created, failures };
}

export type UserStatusUpdateResult =
  | { kind: "updated"; user: { id: number; email: string; role: "admin" | "member"; status: UserStatus; createdAt: Date } }
  | { kind: "not_found" }
  | { kind: "self_disable" };

export function updateUserStatusWithAudit(
  database: AdminDatabase,
  actorUserId: number,
  targetUserId: number,
  requestedStatus: UserStatus,
): UserStatusUpdateResult {
  if (actorUserId === targetUserId && requestedStatus === "disabled") {
    return { kind: "self_disable" };
  }

  return database.transaction(
    (transaction): UserStatusUpdateResult => {
      const [currentUser] = transaction
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1)
        .all();

      if (!currentUser) return { kind: "not_found" };

      const [updatedUser] = transaction
        .update(users)
        .set({ status: requestedStatus })
        .where(eq(users.id, targetUserId))
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
          actorUserId,
          action:
            updatedUser.status === "disabled"
              ? "user.disabled"
              : "user.enabled",
          targetUserId: updatedUser.id,
          metadata: { from: currentUser.status, to: updatedUser.status },
        });
      }

      return updatedUser
        ? { kind: "updated", user: updatedUser }
        : { kind: "not_found" };
    },
    { behavior: "immediate" },
  );
}
