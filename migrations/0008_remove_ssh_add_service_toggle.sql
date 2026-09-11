DROP TABLE `agent_identity`;--> statement-breakpoint
DROP TABLE `hosts`;--> statement-breakpoint
DROP TABLE `known_hosts`;--> statement-breakpoint
ALTER TABLE `sources` ADD `enabled` integer DEFAULT true NOT NULL;