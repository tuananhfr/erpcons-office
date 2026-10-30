import { PI_ACCOUNT_ENABLED } from './pi.ts'

// Online documents (docs/adr/online-tier.md, docs/erp-host.md). With it off the editor pages ship no online code, no
// `window.erpHost` and never call `/api/v1/`. It also needs PI sign-in.
export const ONLINE_ENABLED = true

/** Turns PI sign-in and online documents on in a local build (QA, E2E); see `buildFlags`. */
export const LOCAL_ONLINE_ENV = 'ERPCONS_LOCAL_ONLINE'
/** Points PI sign-in of a local build at another issuer (pi-mock), e.g. `http://127.0.0.1:18797`; see `buildFlags`. */
export const LOCAL_PI_ISSUER_ENV = 'ERPCONS_LOCAL_PI_ISSUER'
const LOCAL_PROVENANCE_ENV = 'ERPCONS_ALLOW_LOCAL_PROVENANCE'
const LOCAL_PROVENANCE_ARG = '--allow-local-provenance'

export interface BuildFlags {
  pi: boolean
  online: boolean
  /** Set when the flags come from the local override instead of the constants above. */
  localOverride: boolean
  /** Issuer origin replacing `PI_ISSUER`, its endpoints and `PI_API_BASE` (local builds only), or null. */
  piIssuer: string | null
}

// A bare origin only: account.js joins paths to it, and a path or query would hide what the build talks to.
function localPiIssuer(value: string | undefined, localProvenance: boolean): string | null {
  if (value === undefined || value === '') return null
  if (!localProvenance) {
    throw new Error(`${LOCAL_PI_ISSUER_ENV} is for local builds only: it also needs ${LOCAL_PROVENANCE_ENV}=1 or ${LOCAL_PROVENANCE_ARG}`)
  }
  let url: URL
  try { url = new URL(value) } catch { throw new Error(`${LOCAL_PI_ISSUER_ENV} must be a bare http(s) origin, got ${value}`) }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${LOCAL_PI_ISSUER_ENV} must be a bare http(s) origin, got ${value}`)
  }
  return url.origin
}

/**
 * Feature flags for one site assembly. Both local overrides need the local-provenance override as well, which
 * build-info.json records and the deploy refuses, so an out/ built with either can never be released.
 */
export function buildFlags(
  env: Readonly<Record<string, string | undefined>> = {},
  argv: readonly string[] = [],
  constants: { pi: boolean; online: boolean } = { pi: PI_ACCOUNT_ENABLED, online: ONLINE_ENABLED },
): BuildFlags {
  const localProvenance = env[LOCAL_PROVENANCE_ENV] === '1' || argv.includes(LOCAL_PROVENANCE_ARG)
  const piIssuer = localPiIssuer(env[LOCAL_PI_ISSUER_ENV], localProvenance)
  if (env[LOCAL_ONLINE_ENV] === undefined || env[LOCAL_ONLINE_ENV] === '') {
    return { pi: constants.pi, online: constants.pi && constants.online, localOverride: piIssuer !== null, piIssuer }
  }
  if (env[LOCAL_ONLINE_ENV] !== '1') throw new Error(`${LOCAL_ONLINE_ENV} must be 1 or unset`)
  if (!localProvenance) {
    throw new Error(`${LOCAL_ONLINE_ENV}=1 is for local builds only: it also needs ${LOCAL_PROVENANCE_ENV}=1 or ${LOCAL_PROVENANCE_ARG}`)
  }
  return { pi: true, online: true, localOverride: true, piIssuer }
}
