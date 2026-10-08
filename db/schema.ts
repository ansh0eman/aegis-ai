import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "disabled";
export type AuditAction =
  | "user.provisioned"
  | "user.disabled"
  | "user.enabled"
  | "user.ai_policy_updated";
export type AuditMetadata = Record<string, string | number | boolean | null>;

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["admin", "member"] })
      .notNull()
      .default("member"),
    status: text("status", { enum: ["active", "disabled"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    check("users_role_check", sql`${table.role} in ('admin', 'member')`),
    check(
      "users_status_check",
      sql`${table.status} in ('active', 'disabled')`,
    ),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    actorUserId: integer("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    targetUserId: integer("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action", {
      enum: [
        "user.provisioned",
        "user.disabled",
        "user.enabled",
        "user.ai_policy_updated",
      ],
    }).notNull(),
    metadata: text("metadata", { mode: "json" }).$type<AuditMetadata>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check(
      "audit_logs_action_check",
      sql`${table.action} in ('user.provisioned', 'user.disabled', 'user.enabled', 'user.ai_policy_updated')`,
    ),
    index("audit_logs_actor_user_id_idx").on(table.actorUserId),
    index("audit_logs_target_user_id_idx").on(table.targetUserId),
    index("audit_logs_created_at_idx").on(table.createdAt),
  ],
);

export const aiPolicies = sqliteTable(
  "ai_policies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    aiEnabled: integer("ai_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    maxPromptChars: integer("max_prompt_chars").notNull().default(4000),
    maxRequestsPerDay: integer("max_requests_per_day")
      .notNull()
      .default(100),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("ai_policies_user_id_unique").on(table.userId),
    check(
      "ai_policies_max_prompt_chars_check",
      sql`${table.maxPromptChars} between 1 and 20000`,
    ),
    check(
      "ai_policies_max_requests_per_day_check",
      sql`${table.maxRequestsPerDay} between 1 and 1000`,
    ),
  ],
);

export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("ai_usage_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export const conversations = sqliteTable("conversations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    conversationId: integer("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant"] }).notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    check(
      "messages_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
    index("messages_conversation_id_id_idx").on(
      table.conversationId,
      table.id,
    ),
  ],
);
