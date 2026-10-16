CREATE TABLE `demo_request_buckets` (
	`scope` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`scope`, `window_start`),
	CONSTRAINT "demo_request_buckets_count_check" CHECK("demo_request_buckets"."request_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `demo_request_buckets_window_start_idx` ON `demo_request_buckets` (`window_start`);