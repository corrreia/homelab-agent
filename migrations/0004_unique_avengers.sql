CREATE TABLE `agent_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`private_key` text NOT NULL,
	`public_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hosts` (
	`slug` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`hostname` text NOT NULL,
	`port` integer DEFAULT 22 NOT NULL,
	`username` text NOT NULL,
	`host_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sources` ADD `host_slug` text REFERENCES hosts(slug);