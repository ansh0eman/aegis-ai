import "server-only";

import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

export { writeAuditLog } from "./audit-write";

export function getRecentAuditLogs(allowedUserIds?: number[]) {
  const actor = alias(users, "audit_actor");
  const target = alias(users, "audit_target");

  const query = db
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
    .leftJoin(target, eq(target.id, auditLogs.targetUserId));
  if (allowedUserIds) {
    if (allowedUserIds.length === 0) return [];
    return query.where(and(
      inArray(auditLogs.actorUserId, allowedUserIds),
      or(isNull(auditLogs.targetUserId), inArray(auditLogs.targetUserId, allowedUserIds)),
    )).orderBy(desc(auditLogs.id)).limit(100).all();
  }
  return query.orderBy(desc(auditLogs.id)).limit(100).all();
}
