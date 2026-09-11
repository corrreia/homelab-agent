PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sources` (
	`slug` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`base_url` text NOT NULL,
	`api_base_path` text,
	`spec_version` text,
	`spec_url` text,
	`fallback_spec_url` text,
	`allow_invalid_tls` integer DEFAULT false NOT NULL,
	`auth_type` text NOT NULL,
	`auth_token` text,
	`auth_header_name` text,
	`auth_header_value` text,
	`auth_username` text,
	`auth_password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_sources`("slug", "kind", "base_url", "api_base_path", "spec_version", "spec_url", "fallback_spec_url", "allow_invalid_tls", "auth_type", "auth_token", "auth_header_name", "auth_header_value", "auth_username", "auth_password", "created_at", "updated_at") SELECT "slug", "kind", "base_url", "api_base_path", "spec_version", "spec_url", "fallback_spec_url", "allow_invalid_tls", "auth_type", "auth_token", "auth_header_name", "auth_header_value", "auth_username", "auth_password", "created_at", "updated_at" FROM `sources`;--> statement-breakpoint
DROP TABLE `sources`;--> statement-breakpoint
ALTER TABLE `__new_sources` RENAME TO `sources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;