import "server-only";

import { desc, eq } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { BetterSQLiteTransaction } from "drizzle-orm/better-sqlite3";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import * as schema from "@/db/schema";
import {
  auditLogs,
  users,
  type AuditAction,
  type AuditMetadata,
} from "@/db/schema";

type AuditTransaction = BetterSQLiteTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export function writeAuditLog(
  transaction: AuditTransaction,
  event: {
    actorUserId: number;
    action: AuditAction;
    targetUserId?: number | null;
    metadata?: AuditMetadata | null;
  },
) {
  transaction
    .insert(auditLogs)
    .values({
      actorUserId: event.actorUserId,
      targetUserId: event.targetUserId ?? null,
      action: event.action,
      metadata: event.metadata ?? null,
    })
    .run();
}

export function getRecentAuditLogs() {
  const actor = alias(users, "audit_actor");
  const target = alias(users, "audit_target");

  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      actor: { id: actor.id, email: actor.email },
      target: { id: target.id, email: target.email },
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .innerJoin(actor, eq(actor.id, auditLogs.actorUserId))
    .leftJoin(target, eq(target.id, auditLogs.targetUserId))
    .orderBy(desc(auditLogs.id))
    .limit(100)
    .all();
}
