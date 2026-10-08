CREATE TABLE `ai_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ai_enabled` integer DEFAULT true NOT NULL,
	`max_prompt_chars` integer DEFAULT 4000 NOT NULL,
	`max_requests_per_day` integer DEFAULT 100 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_policies_max_prompt_chars_check" CHECK("ai_policies"."max_prompt_chars" between 1 and 20000),
	CONSTRAINT "ai_policies_max_requests_per_day_check" CHECK("ai_policies"."max_requests_per_day" between 1 and 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_policies_user_id_unique` ON `ai_policies` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_id_created_at_idx` ON `ai_usage` (`user_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer NOT NULL,
	`target_user_id` integer,
	`action` text NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_logs_action_check" CHECK("__new_audit_logs"."action" in ('user.provisioned', 'user.disabled', 'user.enabled', 'user.ai_policy_updated'))
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "actor_user_id", "target_user_id", "action", "metadata", "created_at") SELECT "id", "actor_user_id", "target_user_id", "action", "metadata", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_logs_actor_user_id_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_target_user_id_idx` ON `audit_logs` (`target_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);