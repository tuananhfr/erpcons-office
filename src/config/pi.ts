// Optional PI ID sign-in (erpcons-account/docs/contract.openapi.yaml, adapted to what the real PI Platform serves).
// With it off the site ships no account UI, no sign-in pages and no `window.erpPi`, so account.js never touches the network.
export const PI_ACCOUNT_ENABLED = true

// PI's production `pi_id_issuer` (PI D578), compared character for character with the tokens' `iss`; the API shares it.
export const PI_ISSUER = 'https://platform.pih.vn'
export const PI_API_BASE = 'https://platform.pih.vn'
export const PI_CLIENT_ID = 'erpcons-office-web'
// Exactly the scopes registered for the web client (PI D580/D581): PI fails the whole authorize on any other scope.
// Never `pi.devices` nor `pi.entitlements`: only the desktop client activates a device and holds a lease.
export const PI_SCOPES = ['openid', 'profile', 'email', 'offline_access'] as const
export const PI_SIGN_IN_PATH = '/dang-nhap/'
export const PI_CALLBACK_PATH = '/dang-nhap/callback/'

// PI's discovery document has no CORS, so the browser cannot read it: the web client takes the endpoints from here.
// Same layout as PI's discovery() and routes, under whatever issuer is configured.
const PI_ENDPOINT_PATHS = {
  authorizationEndpoint: '/id/authorize',
  tokenEndpoint: '/id/token',
  revocationEndpoint: '/id/revoke',
  // Unused: after a sign-out the next sign-in sends `prompt=login` instead of ending PI's own session.
  endSessionEndpoint: '/id/logout',
  meEndpoint: '/api/v1/id/me',
} as const

// Platform licence-signing keys (kid -> Ed25519 `x`, base64url) that verify the feature catalog (lease.md §10).
// Empty until the platform hands them over; the mock's key must never be pinned here. Without a key the
// client skips the catalog fetch and uses its built-in tiers.
export const PI_CATALOG_KEYS: Readonly<Record<string, string>> = {}

export type PiEndpoints = { [K in keyof typeof PI_ENDPOINT_PATHS]: string }

/** Config read by editor-shell/account.js as `window.erpPi`; plain JSON. */
export interface PiConfig extends PiEndpoints {
  version: 1
  issuer: string
  apiBase: string
  clientId: string
  scopes: string
  signInPath: string
  callbackPath: string
  catalogKeys: Record<string, string>
}

export function piEndpoints(issuer: string): PiEndpoints {
  const base = issuer.replace(/\/+$/, '')
  const entries = Object.entries(PI_ENDPOINT_PATHS).map(([key, path]) => [key, base + path])
  return Object.fromEntries(entries) as PiEndpoints
}

/** `localIssuer` replaces the issuer, its endpoints and the API base in local builds only (`buildFlags().piIssuer`). */
export function piConfig(enabled: boolean = PI_ACCOUNT_ENABLED, localIssuer: string | null = null): PiConfig | null {
  if (!enabled) return null
  const issuer = localIssuer ?? PI_ISSUER
  return {
    version: 1,
    issuer,
    apiBase: localIssuer ?? PI_API_BASE,
    ...piEndpoints(issuer),
    clientId: PI_CLIENT_ID,
    scopes: PI_SCOPES.join(' '),
    signInPath: PI_SIGN_IN_PATH,
    callbackPath: PI_CALLBACK_PATH,
    catalogKeys: { ...PI_CATALOG_KEYS },
  }
}

/** The inline statement that hands the config to the shell scripts. `<` is escaped for use inside <script>. */
export function piConfigScript(config: PiConfig): string {
  return `window.erpPi=${JSON.stringify(config).replace(/</g, '\\u003c')}`
}
