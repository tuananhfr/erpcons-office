import { PI_ACCOUNT_ENABLED } from './pi.ts'

// Online documents (docs/adr/online-tier.md, docs/erp-host.md). Off in production: with it off the editor pages ship
// no online code, no `window.erpHost` and never call `/api/v1/`. It also needs PI sign-in.
export const ONLINE_ENABLED = false

/** Turns PI sign-in and online documents on in a local build (QA, E2E); see `buildFlags`. */
export const LOCAL_ONLINE_ENV = 'ERPCONS_LOCAL_ONLINE'
const LOCAL_PROVENANCE_ENV = 'ERPCONS_ALLOW_LOCAL_PROVENANCE'
const LOCAL_PROVENANCE_ARG = '--allow-local-provenance'

export interface BuildFlags {
  pi: boolean
  online: boolean
  /** Set when the flags come from the local override instead of the constants above. */
  localOverride: boolean
}

/**
 * Feature flags for one site assembly. The local override needs the local-provenance override as well, which
 * build-info.json records and the deploy refuses, so an out/ built with it can never be released.
 */
export function buildFlags(
  env: Readonly<Record<string, string | undefined>> = {},
  argv: readonly string[] = [],
  constants: { pi: boolean; online: boolean } = { pi: PI_ACCOUNT_ENABLED, online: ONLINE_ENABLED },
): BuildFlags {
  if (env[LOCAL_ONLINE_ENV] === undefined || env[LOCAL_ONLINE_ENV] === '') {
    return { pi: constants.pi, online: constants.pi && constants.online, localOverride: false }
  }
  if (env[LOCAL_ONLINE_ENV] !== '1') throw new Error(`${LOCAL_ONLINE_ENV} must be 1 or unset`)
  const localProvenance = env[LOCAL_PROVENANCE_ENV] === '1' || argv.includes(LOCAL_PROVENANCE_ARG)
  if (!localProvenance) {
    throw new Error(`${LOCAL_ONLINE_ENV}=1 is for local builds only: it also needs ${LOCAL_PROVENANCE_ENV}=1 or ${LOCAL_PROVENANCE_ARG}`)
  }
  return { pi: true, online: true, localOverride: true }
}
