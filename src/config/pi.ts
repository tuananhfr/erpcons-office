// Optional PI ID sign-in (erpcons-account/docs/contract.openapi.yaml). Off in production: with it off the site
// ships no account UI, no sign-in pages and no `window.erpPi`, so account.js never touches the network.
export const PI_ACCOUNT_ENABLED = false

// Placeholder host from the contract until the PI Platform team assigns one; the API shares it.
export const PI_ISSUER = 'https://id.pi.invalid'
export const PI_API_BASE = 'https://id.pi.invalid'
export const PI_CLIENT_ID = 'erpcons-office-web'
// Never `pi.devices`: web does not activate devices (ADR 0004).
export const PI_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'pi.entitlements'] as const
export const PI_SIGN_IN_PATH = '/dang-nhap/'
export const PI_CALLBACK_PATH = '/dang-nhap/callback/'

// Platform licence-signing keys (kid -> Ed25519 `x`, base64url) that verify the feature catalog (lease.md §10).
// Empty until the platform hands them over; the mock's key must never be pinned here. Without a key the
// client skips the catalog fetch and uses its built-in tiers.
export const PI_CATALOG_KEYS: Readonly<Record<string, string>> = {}

/** Config read by editor-shell/account.js as `window.erpPi`; plain JSON. */
export interface PiConfig {
  version: 1
  issuer: string
  apiBase: string
  clientId: string
  scopes: string
  signInPath: string
  callbackPath: string
  catalogKeys: Record<string, string>
}

export function piConfig(enabled: boolean = PI_ACCOUNT_ENABLED): PiConfig | null {
  if (!enabled) return null
  return {
    version: 1,
    issuer: PI_ISSUER,
    apiBase: PI_API_BASE,
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
