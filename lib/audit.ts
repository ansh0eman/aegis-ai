import "server-only";

import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";

export { writeAuditLog } from "./audit-write";

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
