import type { AuthConfig } from './config'

export interface ServiceTemplate {
  id: string
  name: string
  description: string
  defaultSlug: string
  /** Path under specs/ to the bundled OpenAPI spec */
  bundledSpec: string
  /** Optional public path prefix before API paths */
  publicPathPrefix?: string
  /** Optional versioned spec list when a product's API changes by release */
  specVersions?: Array<{
    value: string
    bundledSpec: string
  }>
  /** Default auth config (user fills in the secret) */
  authType: AuthConfig['type']
  /** For 'header' auth: the header name */
  authHeaderName?: string
  /** Placeholder for the URL input */
  urlPlaceholder: string
  /** Label for the token/secret input */
  tokenLabel: string
  /** URL to logo image */
  logo: string
  /** Brand color hex */
  color: string
  /** Endpoint to test connectivity (relative to base URL) */
  testEndpoint: string
}

export const templates: ServiceTemplate[] = [
  {
    id: 'sonarr',
    name: 'Sonarr',
    description: 'TV show management',
    defaultSlug: 'sonarr',
    bundledSpec: 'sonarr.json',
    authType: 'header',
    authHeaderName: 'X-Api-Key',
    urlPlaceholder: 'http://sonarr:8989',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/Sonarr/Sonarr/develop/Logo/Sonarr.svg',
    color: '#35c5f4',
    testEndpoint: '/api/v3/system/status',
  },
  {
    id: 'radarr',
    name: 'Radarr',
    description: 'Movie management',
    defaultSlug: 'radarr',
    bundledSpec: 'radarr.json',
    authType: 'header',
    authHeaderName: 'X-Api-Key',
    urlPlaceholder: 'http://radarr:7878',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/Radarr/Radarr/develop/Logo/Radarr.svg',
    color: '#ffc230',
    testEndpoint: '/api/v3/system/status',
  },
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    description: 'Indexer manager',
    defaultSlug: 'prowlarr',
    bundledSpec: 'prowlarr.json',
    authType: 'header',
    authHeaderName: 'X-Api-Key',
    urlPlaceholder: 'http://prowlarr:9696',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/Prowlarr/Prowlarr/develop/Logo/Prowlarr.svg',
    color: '#c4a41a',
    testEndpoint: '/api/v1/system/status',
  },
  {
    id: 'lidarr',
    name: 'Lidarr',
    description: 'Music management',
    defaultSlug: 'lidarr',
    bundledSpec: 'lidarr.json',
    authType: 'header',
    authHeaderName: 'X-Api-Key',
    urlPlaceholder: 'http://lidarr:8686',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/Lidarr/Lidarr/develop/Logo/Lidarr.svg',
    color: '#00bc8c',
    testEndpoint: '/api/v1/system/status',
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Media server',
    defaultSlug: 'jellyfin',
    bundledSpec: 'jellyfin.json',
    authType: 'header',
    authHeaderName: 'X-Emby-Token',
    urlPlaceholder: 'http://jellyfin:8096',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg',
    color: '#00a4dc',
    testEndpoint: '/System/Info',
  },
  {
    id: 'seerr',
    name: 'Seerr',
    description: 'Media requests',
    defaultSlug: 'seerr',
    bundledSpec: 'seerr.json',
    authType: 'header',
    authHeaderName: 'X-Api-Key',
    urlPlaceholder: 'http://seerr:5055',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/seerr-team/seerr/develop/public/os_icon.svg',
    color: '#7b2fef',
    testEndpoint: '/api/v1/settings/main',
  },
  {
    id: 'immich',
    name: 'Immich',
    description: 'Photo management',
    defaultSlug: 'immich',
    bundledSpec: 'immich.json',
    authType: 'header',
    authHeaderName: 'x-api-key',
    urlPlaceholder: 'http://immich:2283',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/immich-app/immich/main/docs/static/img/immich-logo.svg',
    color: '#4250af',
    testEndpoint: '/api/users/me',
  },
  {
    id: 'portainer',
    name: 'Portainer',
    description: 'Container management',
    defaultSlug: 'portainer',
    bundledSpec: 'portainer.json',
    authType: 'header',
    authHeaderName: 'X-API-Key',
    urlPlaceholder: 'http://portainer:9000',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/portainer/portainer/develop/app/assets/images/logo_alt.svg',
    color: '#13bef9',
    testEndpoint: '/api/endpoints',
  },
  {
    id: 'bazarr',
    name: 'Bazarr',
    description: 'Subtitle management',
    defaultSlug: 'bazarr',
    bundledSpec: 'bazarr.json',
    authType: 'header',
    authHeaderName: 'X-API-KEY',
    urlPlaceholder: 'http://bazarr:6767',
    tokenLabel: 'API Key',
    logo: 'https://raw.githubusercontent.com/morpheus65535/bazarr/master/frontend/public/images/logo128.png',
    color: '#2ea44f',
    testEndpoint: '/api/system/status',
  },
  {
    id: 'unifi-network',
    name: 'UniFi Network',
    description: 'UniFi network controller',
    defaultSlug: 'unifi-network',
    bundledSpec: 'unifi-network/10.3.47.json',
    publicPathPrefix: '/proxy/network',
    specVersions: [
      { value: '10.3.47', bundledSpec: 'unifi-network/10.3.47.json' },
      { value: '10.2.105', bundledSpec: 'unifi-network/10.2.105.json' },
      { value: '10.2.104', bundledSpec: 'unifi-network/10.2.104.json' },
      { value: '10.2.97', bundledSpec: 'unifi-network/10.2.97.json' },
      { value: '10.2.93', bundledSpec: 'unifi-network/10.2.93.json' },
    ],
    authType: 'header',
    authHeaderName: 'X-API-KEY',
    urlPlaceholder: 'https://unifi-controller.example.com',
    tokenLabel: 'API Key',
    logo: 'https://cdn.simpleicons.org/ubiquiti/0559C9',
    color: '#0559c9',
    testEndpoint: '/integration/v1/info',
  },
  {
    id: 'unifi-protect',
    name: 'UniFi Protect',
    description: 'UniFi camera and NVR management',
    defaultSlug: 'unifi-protect',
    bundledSpec: 'unifi-protect/7.0.106.json',
    publicPathPrefix: '/proxy/protect',
    specVersions: [
      { value: '7.0.106', bundledSpec: 'unifi-protect/7.0.106.json' },
      { value: '7.0.104', bundledSpec: 'unifi-protect/7.0.104.json' },
      { value: '7.0.94', bundledSpec: 'unifi-protect/7.0.94.json' },
      { value: '7.0.88', bundledSpec: 'unifi-protect/7.0.88.json' },
      { value: '7.0.85', bundledSpec: 'unifi-protect/7.0.85.json' },
    ],
    authType: 'header',
    authHeaderName: 'X-API-KEY',
    urlPlaceholder: 'https://unifi-protect.example.com',
    tokenLabel: 'API Key',
    logo: 'https://cdn.simpleicons.org/ubiquiti/0559C9',
    color: '#0b7cff',
    testEndpoint: '/integration/v1/meta/info',
  },
]

export function getTemplate(id: string): ServiceTemplate | undefined {
  return templates.find((t) => t.id === id)
}

export function resolveBundledSpec(template: ServiceTemplate, version?: string): string {
  if (template.specVersions && template.specVersions.length > 0) {
    const match = template.specVersions.find((v) => v.value === version)
    return (match ?? template.specVersions[0]).bundledSpec
  }
  return template.bundledSpec
}
