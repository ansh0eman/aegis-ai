ALTER TABLE `users`
ADD `status` text DEFAULT 'active' NOT NULL
CONSTRAINT `users_status_check`
CHECK (`status` in ('active', 'disabled'));
