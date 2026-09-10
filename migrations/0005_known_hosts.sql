CREATE TABLE `known_hosts` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`host_key` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `known_hosts` (`endpoint`, `host_key`, `created_at`)
SELECT `hostname` || ':' || `port`, `host_key`, `updated_at` FROM `hosts` WHERE `host_key` IS NOT NULL;
--> statement-breakpoint
ALTER TABLE `hosts` DROP COLUMN `host_key`;