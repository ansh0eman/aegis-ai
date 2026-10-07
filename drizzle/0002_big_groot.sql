ALTER TABLE `users`
ADD `role` text DEFAULT 'member' NOT NULL
CONSTRAINT `users_role_check`
CHECK (`role` in ('admin', 'member'));
