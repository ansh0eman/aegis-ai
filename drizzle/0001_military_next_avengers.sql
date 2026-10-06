-- Remove the two pre-auth development conversations and their messages. They
-- cannot satisfy the new required-owner constraint and were approved for deletion.
DELETE FROM `messages`;
--> statement-breakpoint
DELETE FROM `conversations`;
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `user_id` integer NOT NULL REFERENCES users(id);
