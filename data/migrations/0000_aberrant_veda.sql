CREATE TABLE `sources` (
	`slug` text PRIMARY KEY NOT NULL,
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
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
