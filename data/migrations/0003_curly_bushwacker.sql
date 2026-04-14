ALTER TABLE `sources` ADD `kind` text DEFAULT 'custom' NOT NULL;
--> statement-breakpoint
UPDATE `sources` SET `kind` = `slug` WHERE `slug` IN (
  'sonarr', 'radarr', 'prowlarr', 'lidarr', 'readarr',
  'jellyfin', 'seerr', 'immich', 'portainer', 'bazarr',
  'unifi-network', 'unifi-protect'
);