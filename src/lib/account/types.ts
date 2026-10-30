/**
 * `window.erpAccount`, version 1, installed by editor-shell/account.js on every editor and landing page.
 * All data is plain JSON (frozen) so the wasm editors can read it through wasm-bindgen; a breaking change bumps
 * `version`. Without `window.erpPi` (feature flag off) or in embed mode, status is `disabled`, `allowed()` answers
 * from the built-in catalog and nothing touches the network.
 */
export type AccountStatus = 'disabled' | 'signed-out' | 'signing-in' | 'signed-in'

export type ProductId = 'vanban' | 'bangtinh' | 'trinhchieu' | 'pdf'

export interface AccountUser {
  id: string
  name: string
  email: string | null
}

export interface AccountOrg {
  id: string
  name: string
  role: string | null
}

export interface AccountEntitlement {
  id: string
  feature: string
  scope: 'personal' | 'organization'
  orgId: string | null
  validTo: string | null
  offlineAllowed: boolean
}

export interface AccountError {
  /** Contract error code or a client code (`popup_blocked`, `state_mismatch`, `session_expired`…). */
  code: string
  /** Vietnamese text ready for the UI. */
  message: string
  retryAfter: number | null
}

export interface AccountSnapshot {
  version: 1
  status: AccountStatus
  user: AccountUser | null
  /** Active memberships only; the personal context is implicit. */
  orgs: AccountOrg[]
  /** `null` is the personal context. */
  activeOrg: AccountOrg | null
  /** Product of the current editor page; `null` on the landing. */
  product: ProductId | null
  entitlements: AccountEntitlement[]
  /** Fetched at most 10 min ago for the current user and organization (products.md §4). */
  entitlementsFresh: boolean
  error: AccountError | null
}

export interface ErpAccount {
  version: 1
  status(): AccountStatus
  user(): AccountUser | null
  orgs(): AccountOrg[]
  activeOrg(): AccountOrg | null
  /**
   * `null` switches to the personal context. Opens the PI ID popup (call it from a click handler): PI switches
   * organization only by signing in again. Resolves when the popup is done; the active org is the one PI chose.
   */
  selectOrg(orgId: string | null): Promise<AccountSnapshot>
  entitlements(): AccountEntitlement[]
  /** Never blocks: answers from cached state and refreshes stale entitlements in the background. */
  allowed(feature: string): boolean
  /** Opens the PI ID popup; call it from a click handler. Never rejects; failures land in `snapshot().error`. */
  signIn(): Promise<AccountSnapshot>
  signOut(): Promise<AccountSnapshot>
  /** Same object until something changes, so it can back `useSyncExternalStore`. */
  snapshot(): AccountSnapshot
  /** Returns the unsubscribe function. */
  onChange(listener: (snapshot: AccountSnapshot) => void): () => void
  /**
   * Same-origin `/api/v1/…` only (throws `invalid_api_path` before any request otherwise), with the access token
   * attached; a 401 refreshes once and retries, then rejects with `unauthenticated`. Network failure: `network`.
   */
  apiFetch(path: string, init?: RequestInit): Promise<Response>

}
