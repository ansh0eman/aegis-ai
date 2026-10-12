import "server-only";

import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { BetterSQLiteTransaction } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import {
  auditLogs,
  type AuditAction,
  type AuditMetadata,
} from "../db/schema";

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
