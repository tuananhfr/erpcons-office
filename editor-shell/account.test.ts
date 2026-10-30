import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { piConfig, type PiConfig } from '../src/config/pi.ts'
import type { AccountSnapshot, ErpAccount } from '../src/lib/account/types.ts'
import { ChannelHub, ManualClock, MemoryStorage, SharedLocks, SharedStorage, settle } from './fake-browser.ts'
import {
  AN, AUDIENCE, BINH, CLIENT_ID, FakePi, ISSUER, ME_PATH, ORG_KT, ORG_OLD, ORG_XD, REDIRECT_URI, SITE_ORIGIN, WEB_SCOPES,
  json, piError, type AuthorizeOptions,
} from './fake-pi.ts'

const SOURCE = fs.readFileSync(fileURLToPath(new URL('account.js', import.meta.url)), 'utf8')
const SESSION = 'erpcons-pi-session'
const PROFILE = 'erpcons-pi-profile'
const MINUTE = 60_000
const JWT = /^[\w-]+\.[\w-]+\.[\w-]+$/

interface Popup { url: string; name: string; closed: boolean; focus: () => void }
interface PageElement { hidden: boolean; textContent: string; focused: boolean; listeners: (() => void)[]; focus(): void; addEventListener(type: string, fn: () => void): void; click(): void }
interface TabOptions {
  config?: PiConfig | null
  session?: MemoryStorage
  popup?: Popup
  popupBlocked?: boolean
  channel?: boolean
  random?: (bytes: Uint8Array) => void
}
interface Tab {
  account: ErpAccount
  opened: Popup[]
  replaced: string[]
  history: string[]
  closeCalls: number
  page: Record<'status' | 'error' | 'message' | 'close', PageElement>
  errors: unknown[][]
  warnings: unknown[][]
}

function element(hidden = false): PageElement {
  return {
    hidden, textContent: '', focused: false, listeners: [],
    focus() { this.focused = true },
    addEventListener(type, fn) { if (type === 'click') this.listeners.push(fn) },
    click() { this.listeners.forEach(fn => fn()) },
  }
}

class Env {
  clock = new ManualClock()
  local = new SharedStorage()
  hub = new ChannelHub()
  locks: SharedLocks | null = new SharedLocks()
  pi = new FakePi(() => this.clock.now)
  config: PiConfig = piConfig(true, ISSUER)!
  /** The site's own origin (Office API); every request to it is recorded in `siteCalls`. */
  site: ((url: string, init: RequestInit) => Promise<Response>) | null = null
  siteCalls: { url: string; init: RequestInit }[] = []
  /** Planned platform endpoints (see `servePlanned`): signed catalogs per product, entitlements per `sub|org`. */
  catalogs: Record<string, string> = {}
  entitlements: Record<string, Record<string, unknown>[]> = {}

  open(path: string, options: TabOptions = {}): Tab {
    const url = new URL(path, SITE_ORIGIN)
    const listeners: Record<string, ((event: unknown) => void)[]> = {}
    const page = { status: element(), error: element(true), message: element(), close: element() }
    const tab: Tab = { account: undefined as unknown as ErpAccount, opened: [], replaced: [], history: [], closeCalls: 0, page, errors: [], warnings: [] }
    const config = options.config === undefined ? this.config : options.config
    const random = options.random
    const context: Record<string, unknown> = {
      console: { warn: (...args: unknown[]) => tab.warnings.push(args), error: (...args: unknown[]) => tab.errors.push(args), log: () => {} },
      location: {
        pathname: url.pathname, search: url.search, origin: SITE_ORIGIN,
        replace: (to: string) => { tab.replaced.push(to) },
      },
      history: { replaceState: (_state: unknown, _title: string, to: string) => { tab.history.push(to) } },
      URL, URLSearchParams, TextEncoder, TextDecoder, Uint8Array, atob, btoa,
      crypto: {
        subtle: globalThis.crypto.subtle,
        getRandomValues: (bytes: Uint8Array) => (random ? random(bytes) : globalThis.crypto.getRandomValues(bytes), bytes),
      },
      Date: { now: () => this.clock.now },
      performance: { now: () => this.clock.now },
      setTimeout: this.clock.setTimeout, clearTimeout: this.clock.clearTimeout,
      setInterval: this.clock.setInterval, clearInterval: this.clock.clearInterval,
      fetch: (input: string, init: RequestInit = {}) => {
        if (!input.startsWith(SITE_ORIGIN + '/')) return this.pi.fetch(input, init as unknown as Parameters<FakePi['fetch']>[1])
        this.siteCalls.push({ url: input, init })
        return this.site ? this.site(input, init) : Promise.reject(new TypeError('Failed to fetch'))
      },
      navigator: this.locks ? { locks: this.locks } : {},
      sessionStorage: options.session ?? new MemoryStorage(),
      addEventListener: (type: string, fn: (event: unknown) => void) => { (listeners[type] ||= []).push(fn) },
      open: (target: string, name: string) => {
        if (options.popupBlocked) return null
        const popup: Popup = { url: target, name, closed: false, focus: vi.fn() }
        tab.opened.push(popup)
        return popup
      },
      close: () => {
        tab.closeCalls += 1
        if (options.popup) options.popup.closed = true
      },
      document: {
        querySelector: (selector: string) => {
          const match = /^\[data-erp-sign-in-([a-z]+)\]$/.exec(selector)
          return match ? page[match[1] as keyof typeof page] ?? null : null
        },
      },
    }
    if (options.channel !== false) context.BroadcastChannel = this.hub.channelClass()
    context.localStorage = this.local.view(tab, (event) => (listeners.storage ?? []).forEach(fn => fn(event)))
    if (config) context.erpPi = config
    context.window = context
    vm.createContext(context)
    vm.runInContext(SOURCE, context)
    tab.account = context.erpAccount as ErpAccount
    return tab
  }

  /** A session left by an earlier sign-in in this browser: refresh token known to PI, PI's own session cookie alive. */
  signedIn(sub = AN, org: string | null = null): string {
    const token = this.pi.seedRefreshToken(sub, org)
    this.pi.session = { account: sub, expires: Math.floor(this.clock.now / 1000) + 12 * 3600 }
    this.local.map.set(SESSION, JSON.stringify({ v: 1, refresh_token: token, gen: 'seed', sub, org_context: org, login: 'seed' }))
    this.local.map.set(PROFILE, JSON.stringify({ v: 1, sub, user: { id: sub, name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' }, orgs: [] }))
    return token
  }

  session() { return this.local.json<{ refresh_token: string; org_context: string | null; gen: string; sub: string }>(SESSION) }

  /**
   * PI serves neither the signed feature catalog nor Office-shaped entitlements yet: these stand in for the planned
   * endpoints (old contract shape) so the code that stays gated behind a pinned catalog keeps its tests.
   */
  servePlanned() {
    this.pi.extraCorsPrefixes.push('/v1/')
    this.pi.on((call) => {
      const catalog = /^\/v1\/products\/([a-z]+)\/feature-catalog$/.exec(call.path)
      if (catalog) return this.catalogs[catalog[1]] ? json(200, { catalog: this.catalogs[catalog[1]] }) : json(503, {})
      if (call.path !== '/v1/me/entitlements') return undefined
      const claims = this.pi.verifyJwt((call.headers.Authorization ?? '').replace(/^Bearer /, ''))
      if (!claims) return json(401, {})
      const org = (claims.org_context as string | null) ?? null
      const product = call.query.get('product_id')
      const list = (this.entitlements[`${claims.sub}|${org ?? ''}`] ?? []).filter(e => e.product_id === product)
      return json(200, { product_id: product, org_context: org, entitlements: list })
    }, false)
  }
}

/** The popup the opener just opened runs /dang-nhap/, PI ID answers, the popup runs the callback. */
async function completePopup(env: Env, opener: Tab, done: Promise<AccountSnapshot>, options: AuthorizeOptions & { edit?: (callbackUrl: string) => string } = {}) {
  const popup = opener.opened[opener.opened.length - 1]
  const session = new MemoryStorage()
  const start = env.open(popup.url, { session, popup })
  await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
  const authorize = new URL(start.replaced[0])
  const callbackUrl = (options.edit ?? (u => u))(env.pi.authorize(start.replaced[0], options))
  const callback = env.open(callbackUrl, { session, popup })
  await settle()
  return { done, popup, start, callback, session, authorize }
}
const popupSignIn = (env: Env, opener: Tab, options: AuthorizeOptions & { edit?: (callbackUrl: string) => string } = {}) =>
  completePopup(env, opener, opener.account.signIn(), options)

const meCalls = (env: Env) => env.pi.calls.filter(c => c.path === ME_PATH)
const entitlementCalls = (env: Env) => env.pi.calls.filter(c => c.path === '/v1/me/entitlements')
const bearerOf = (call: { headers: Record<string, string> }) => (call.headers.Authorization ?? '').replace(/^Bearer /, '')

describe('feature flag off and embed mode', () => {
  it('without window.erpPi installs a guest account that never touches network, storage or popups', async () => {
    const env = new Env()
    env.signedIn()
    const writes = env.local.writes
    const tab = env.open('/van-ban/', { config: null })
    await settle()
    expect(tab.account.status()).toBe('disabled')
    expect(tab.account.snapshot()).toMatchObject({ version: 1, status: 'disabled', user: null, orgs: [], activeOrg: null, error: null })
    expect(tab.account.allowed('vanban.use')).toBe(true)
    expect(tab.account.allowed('vanban.view')).toBe(true)
    expect((await tab.account.signIn()).status).toBe('disabled')
    expect((await tab.account.signOut()).status).toBe('disabled')
    expect((await tab.account.selectOrg(ORG_XD)).status).toBe('disabled')
    expect(tab.opened).toEqual([])
    expect(env.pi.calls).toEqual([])
    expect(env.local.writes).toBe(writes)
    expect(env.hub.channels).toEqual([])
  })

  it.each(['?embed=erpcons&parent=https%3A%2F%2Flpc.vn', '?host=parent'])('inside the ERP iframe (%s) makes no PI call and offers no sign-in', async (search) => {
    const env = new Env()
    env.signedIn()
    const tab = env.open(`/van-ban/${search}`)
    await settle()
    env.clock.advance(25 * 3600 * 1000)
    await settle()
    expect(tab.account.status()).toBe('disabled')
    expect((await tab.account.signIn()).status).toBe('disabled')
    expect(tab.account.allowed('vanban.use')).toBe(true)
    expect(tab.opened).toEqual([])
    expect(env.pi.calls).toEqual([])
  })

  it('rejects features outside the built-in catalog', () => {
    const tab = new Env().open('/van-ban/', { config: null })
    expect(tab.account.allowed('vanban.macro')).toBe(false)
    expect(tab.account.allowed('word.use')).toBe(false)
    expect(tab.errors).toHaveLength(2)
  })
})

describe('sign-in popup', () => {
  it('opens /dang-nhap/ in a named popup with the UI language and nothing secret in the URL', () => {
    const env = new Env()
    env.local.map.set('erpcons-ui-language', 'en')
    const tab = env.open('/bang-tinh/')
    void tab.account.signIn()
    expect(tab.opened).toHaveLength(1)
    expect(tab.opened[0]).toMatchObject({ url: '/dang-nhap/?ui_locales=en', name: 'erpcons-pi-sign-in' })
    expect(tab.account.status()).toBe('signing-in')
  })

  it('sends PI an S256 challenge of the verifier it keeps in the popup (RFC 7636 appendix B)', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/')
    void tab.account.signIn()
    const rfcOctets = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]
    let first = true
    const session = new MemoryStorage()
    const start = env.open(tab.opened[0].url, {
      session,
      random: (bytes) => {
        if (first && bytes.length === 32) bytes.set(rfcOctets)
        else globalThis.crypto.getRandomValues(bytes)
        first = false
      },
    })
    await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
    const request = new URL(start.replaced[0])
    const pending = JSON.parse(session.getItem('erpcons-pi-pending')!)
    expect(request.origin + request.pathname).toBe(`${ISSUER}/id/authorize`)
    expect(pending.verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(request.searchParams.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(Object.fromEntries(request.searchParams)).toMatchObject({
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: WEB_SCOPES,
      code_challenge_method: 'S256', state: pending.state, nonce: pending.nonce, ui_locales: 'vi',
    })
    for (const name of ['org_context', 'org_hint', 'prompt']) expect(request.searchParams.has(name)).toBe(false)
    expect(request.searchParams.get('scope')).not.toContain('pi.')
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(pending.nonce).not.toBe(pending.state)
    // Nothing reaches shared storage before the callback.
    expect([...env.local.map.keys()]).toEqual([])
  })

  it('a fresh random verifier hashes to its challenge', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/')
    void tab.account.signIn()
    const session = new MemoryStorage()
    const start = env.open(tab.opened[0].url, { session })
    await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
    const { verifier } = JSON.parse(session.getItem('erpcons-pi-pending')!)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(new URL(start.replaced[0]).searchParams.get('code_challenge')).toBe(createHash('sha256').update(verifier).digest('base64url'))
  })

  it('delivers PI\'s EdDSA access token to the opener and the other tabs, then closes', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const other = env.open('/bang-tinh/')
    const { done, popup, callback } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-in')
    expect(popup.closed).toBe(true)
    // The one-time code leaves the address bar before anything else happens.
    expect(callback.history).toEqual(['/dang-nhap/callback/'])
    await vi.waitFor(() => expect(opener.account.user()).toEqual({ id: AN, name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' }))
    await vi.waitFor(() => expect(other.account.status()).toBe('signed-in'))
    // The broadcast access token is used as is: no refresh grant in any tab.
    expect(env.pi.grants('authorization_code')).toHaveLength(1)
    expect(env.pi.grants('refresh_token')).toHaveLength(0)
    await vi.waitFor(() => expect(meCalls(env).length).toBeGreaterThanOrEqual(3))
    const token = bearerOf(meCalls(env)[0])
    expect(token).toMatch(JWT)
    expect(meCalls(env).every(c => bearerOf(c) === token)).toBe(true)
    expect(env.pi.verifyJwt(token)).toMatchObject({ iss: ISSUER, sub: AN, aud: [AUDIENCE], azp: CLIENT_ID, scope: WEB_SCOPES })
    // Access token in memory only: never written to any storage.
    expect([...env.local.map.values()].join('\n')).not.toContain(token)
    expect(env.session()?.refresh_token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    const exchange = env.pi.grants('authorization_code')[0].body!
    expect(exchange.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(exchange.get('client_id')).toBe(CLIENT_ID)
  })

  it('never reads PI discovery, which PI serves without CORS: the endpoints come from the site config', async () => {
    const env = new Env()
    await expect(env.pi.fetch(`${ISSUER}/.well-known/openid-configuration`, { credentials: 'omit' })).rejects.toThrow('Failed to fetch')
    const opener = env.open('/van-ban/')
    expect((await (await popupSignIn(env, opener)).done).status).toBe('signed-in')
    expect(env.pi.calls.filter(c => c.path.startsWith('/.well-known/'))).toHaveLength(1)

    const broken = new Env()
    broken.config = { ...broken.config, authorizationEndpoint: undefined as unknown as string }
    const tab = broken.open('/van-ban/')
    const done = tab.account.signIn()
    const start = broken.open(tab.opened[0].url, { popup: tab.opened[0] })
    expect((await done).error?.code).toBe('discovery_failed')
    expect(start.replaced).toEqual([])
    expect(start.page.error.hidden).toBe(false)
  })

  it('rejects a callback whose state does not match the popup, without exchanging the code', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener, { edit: (url) => url.replace(/state=[^&]+/, 'state=forged') })
    const snapshot = await done
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('state_mismatch')
    expect(callback.page.error.hidden).toBe(false)
    expect(callback.page.message.textContent).toContain('không hợp lệ')
    expect(callback.page.close.focused).toBe(true)
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it('rejects a callback that names another issuer (RFC 9207), without exchanging the code', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done } = await popupSignIn(env, opener, { edit: (url) => url.replace(/iss=[^&]+/, 'iss=https%3A%2F%2Fevil.example') })
    expect((await done).error?.code).toBe('issuer_mismatch')
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it('accepts a callback only once (the pending state is consumed)', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { session, popup, done } = await popupSignIn(env, opener)
    await done
    const callbackUrl = `${REDIRECT_URI}?code=code-x&state=whatever`
    const replay = env.open(callbackUrl, { session, popup })
    await settle()
    expect(replay.page.error.hidden).toBe(false)
    expect(env.pi.grants('authorization_code')).toHaveLength(1)
  })

  it('rejects an ID token whose nonce differs from the one sent', async () => {
    const env = new Env()
    env.pi.idTokenOverrides = { nonce: 'replayed-nonce' }
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('nonce_mismatch')
    expect(callback.page.error.hidden).toBe(false)
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it.each([
    ['another audience', { aud: 'erpcons-office-desktop' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an expired token', { exp: 1 }],
  ])('rejects an ID token with %s', async (_name, overrides) => {
    const env = new Env()
    env.pi.idTokenOverrides = overrides
    const opener = env.open('/van-ban/')
    const { done } = await popupSignIn(env, opener)
    expect((await done).error?.code).toBe('invalid_id_token')
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it('maps PI\'s /me user, an empty email included, to the account user', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done } = await popupSignIn(env, opener, { as: BINH })
    expect((await done).user).toEqual({ id: BINH, name: 'Trần Thị Bình', email: null })
    expect(env.session()?.sub).toBe(BINH)
  })

  it('takes the active organization from /me: PI picks the only one without asking', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(env.pi.pages).toEqual(['login'])
    expect(snapshot.activeOrg).toEqual({ id: ORG_XD, name: 'Công ty Xây dựng Ví dụ', role: 'member' })
    expect(snapshot.orgs).toEqual([{ id: ORG_XD, name: 'Công ty Xây dựng Ví dụ', role: 'member' }])
    expect(env.session()?.org_context).toBe(ORG_XD)
    expect(env.pi.verifyJwt(bearerOf(meCalls(env)[0]))?.org_context).toBe(ORG_XD)
  })

  it('a user of two organizations picks one on PI\'s page, and that is the active one', async () => {
    const env = new Env()
    env.pi.setMembership(AN, ORG_KT, 'ACTIVE', 'org_admin')
    const opener = env.open('/van-ban/')
    const { done } = await popupSignIn(env, opener, { choose: ORG_KT })
    const snapshot = await done
    expect(env.pi.pages).toEqual(['login', 'org'])
    expect(snapshot.activeOrg).toEqual({ id: ORG_KT, name: 'Kiến trúc Mẫu', role: 'org_admin' })
    expect(snapshot.orgs.map(o => o.id)).toEqual([ORG_XD, ORG_KT])
  })

  it('a /me failure right after the code exchange keeps the user signed out and revokes the new tokens', async () => {
    const env = new Env()
    env.pi.on(call => (call.path === ME_PATH ? piError(403, 'Tài khoản PI ID đã bị khoá.', 'ACCOUNT_LOCKED') : undefined))
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('user_suspended')
    expect(callback.page.error.hidden).toBe(false)
    expect(env.local.map.has(SESSION)).toBe(false)
    const revoke = env.pi.calls.find(c => c.path === '/id/revoke')!
    expect(env.pi.refreshState(revoke.body!.get('token')!)?.revokeReason).toBe('revoked_by_client')
  })

  it('goes back to signed out without an error when the popup is closed, and can sign in again', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/')
    const timers = env.clock.pending()
    const done = tab.account.signIn()
    expect(tab.account.status()).toBe('signing-in')
    tab.opened[0].closed = true
    env.clock.advance(1000)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error).toBeNull()
    expect(env.clock.pending()).toBe(timers)
    env.clock.advance(60 * MINUTE)
    await settle()
    expect(env.pi.calls).toEqual([])
    void tab.account.signIn()
    expect(tab.opened).toHaveLength(2)
  })

  it('treats "access denied" as a cancel: the popup closes, no error loop', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener, { edit: (url) => url.replace(/code=[^&]+/, 'error=access_denied') })
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error).toBeNull()
    expect(callback.closeCalls).toBe(1)
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
  })

  it('a scope PI does not grant the client (the old `pi.entitlements`) fails the sign-in at PI', async () => {
    const env = new Env()
    env.config = { ...env.config, scopes: `${WEB_SCOPES} pi.entitlements` }
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('sign_in_failed')
    expect(callback.page.error.hidden).toBe(false)
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
  })

  it('reports PI ID as busy or down, not as a network problem, when the code exchange answers 429 or 503', async () => {
    for (const [status, code] of [[429, 'rate_limited'], [503, 'dependency_unavailable']] as const) {
      const env = new Env()
      env.pi.on(call => (call.path === '/id/token' ? json(status, { error: 'temporarily_unavailable' }) : undefined))
      const opener = env.open('/van-ban/')
      const { done } = await popupSignIn(env, opener)
      expect((await done).error?.code).toBe(code)
    }
  })

  it('reports a blocked popup', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/', { popupBlocked: true })
    const snapshot = await tab.account.signIn()
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('popup_blocked')
    expect(snapshot.error?.message).toContain('chặn cửa sổ')
  })

  it('a sign-in that lands after the popup looked closed still signs the tab in', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const done = opener.account.signIn()
    const popup = opener.opened[0]
    // Cross-origin isolation can make `closed` read true while the user is still on the PI ID page.
    popup.closed = true
    env.clock.advance(1000)
    expect((await done).status).toBe('signed-out')
    popup.closed = false
    const session = new MemoryStorage()
    const start = env.open(popup.url, { session, popup })
    await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
    env.open(env.pi.authorize(start.replaced[0]), { session, popup })
    await vi.waitFor(() => expect(opener.account.status()).toBe('signed-in'))
  })

  it('without BroadcastChannel the opener learns the sign-in from the storage event', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/', { channel: false })
    const done = opener.account.signIn()
    const popup = opener.opened[0]
    const session = new MemoryStorage()
    const start = env.open(popup.url, { session, popup })
    await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
    env.open(env.pi.authorize(start.replaced[0]), { session, popup })
    expect((await done).status).toBe('signed-in')
    // No broadcast token: this tab gets its own through one serialized refresh (the first /me is the callback's).
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
  })
})

describe('signing in again', () => {
  it('after a sign-out the next sign-in asks PI for credentials (prompt=login), though PI\'s session is alive', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/')
    await (await popupSignIn(env, tab)).done
    expect(env.pi.pages).toEqual(['login'])
    await tab.account.signOut()

    const again = await popupSignIn(env, tab, { as: BINH })
    expect(tab.opened.at(-1)!.url).toBe('/dang-nhap/?ui_locales=vi&prompt=login')
    expect(again.authorize.searchParams.get('prompt')).toBe('login')
    expect((await again.done).user?.id).toBe(BINH)
    expect(env.pi.pages).toEqual(['login', 'login'])
    expect(env.local.map.has('erpcons-pi-signed-out')).toBe(false)
  })

  it('without a sign-out PI\'s live session signs the user straight back in', async () => {
    const env = new Env()
    const tab = env.open('/van-ban/')
    await (await popupSignIn(env, tab)).done
    // The platform ended the token family; PI's own browser session (12 h) is still there.
    env.pi.revokeAll()
    const other = env.open('/bang-tinh/')
    await vi.waitFor(() => expect(other.account.status()).toBe('signed-out'))
    const again = await popupSignIn(env, other)
    expect(again.authorize.searchParams.has('prompt')).toBe(false)
    expect((await again.done).status).toBe('signed-in')
    expect(env.pi.pages).toEqual(['login'])
  })
})

describe('tokens across tabs', () => {
  it('rotates the refresh token on start-up and stores the new one', async () => {
    const env = new Env()
    const seeded = env.signedIn()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    expect(Object.fromEntries(env.pi.grants('refresh_token')[0].body!)).toEqual({ grant_type: 'refresh_token', refresh_token: seeded, client_id: CLIENT_ID })
    const stored = env.session()!.refresh_token
    expect(stored).not.toBe(seeded)
    expect(env.pi.refreshState(seeded)?.rotatedAt).not.toBeNull()
    expect(env.pi.refreshState(stored)?.rotatedAt).toBeNull()
    expect(tab.account.status()).toBe('signed-in')
  })

  it('two tabs needing a token at once make a single network refresh', async () => {
    const env = new Env()
    env.signedIn()
    const a = env.open('/van-ban/')
    const b = env.open('/bang-tinh/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    expect(new Set(meCalls(env).map(bearerOf)).size).toBe(1)
    expect(env.locks!.requests.filter(name => name === 'erpcons-pi-refresh').length).toBeGreaterThanOrEqual(2)
    expect(a.account.status()).toBe('signed-in')
    expect(b.account.status()).toBe('signed-in')
    expect(env.pi.refreshState(env.session()!.refresh_token)?.rotatedAt).toBeNull()
  })

  it('without BroadcastChannel a waiting tab still never replays a rotated token', async () => {
    const env = new Env()
    env.signedIn()
    env.open('/van-ban/', { channel: false })
    env.open('/bang-tinh/', { channel: false })
    await settle()
    env.clock.advance(2000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    const grants = env.pi.grants('refresh_token').map(c => c.body!.get('refresh_token'))
    expect(grants).toHaveLength(2)
    expect(new Set(grants).size).toBe(2)
    expect(env.session()).not.toBeNull()
  })

  it('refreshes again once PI\'s 10 min access token runs out', async () => {
    const env = new Env()
    env.signedIn()
    env.site = async () => json(200, { ok: true })
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    await tab.account.apiFetch('/api/v1/documents')
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    env.clock.advance(9 * MINUTE)
    await tab.account.apiFetch('/api/v1/documents')
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    env.clock.advance(2 * MINUTE)
    await tab.account.apiFetch('/api/v1/documents')
    expect(env.pi.grants('refresh_token')).toHaveLength(2)
  })

  it('a replayed (reuse-detected) refresh token signs every tab out cleanly, with no retry loop', async () => {
    const env = new Env()
    const seeded = env.signedIn()
    // Someone else already used this token: presenting it again revokes the family.
    await env.pi.fetch(`${ISSUER}/id/token`, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${seeded}&client_id=${CLIENT_ID}`,
    })
    const tab = env.open('/van-ban/')
    const other = env.open('/', { channel: false })
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe('session_expired')
    expect(env.pi.refreshState(seeded)?.revokeReason).toBe('refresh_reuse')
    expect(env.local.map.has(SESSION)).toBe(false)
    expect(env.local.map.has(PROFILE)).toBe(false)
    await vi.waitFor(() => expect(other.account.status()).toBe('signed-out'))
    const before = env.pi.calls.length
    env.clock.advance(60 * MINUTE)
    await settle()
    expect(env.pi.calls.length).toBe(before)
  })

  it('invalid_grant after the platform revoked the session signs out', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.revokeAll()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.message).toContain('hết hạn')
  })

  it.each([
    ['the account is locked', (env: Env) => { env.pi.accounts[AN].status = 'LOCKED' }],
    ['the membership of the token\'s organization ended', (env: Env) => env.pi.setMembership(AN, ORG_XD, 'REVOKED')],
  ])('PI refuses the next refresh when %s: the tab signs out', async (_name, change) => {
    const env = new Env()
    const token = env.signedIn(AN, ORG_XD)
    change(env)
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe('session_expired')
    expect(env.pi.refreshState(token)?.revokeReason).toBe('not_eligible')
  })

  it('sign-out revokes the refresh token family at PI, clears storage and signs the other tabs out', async () => {
    const env = new Env()
    env.signedIn()
    const a = env.open('/van-ban/')
    const b = env.open('/pdf/')
    const c = env.open('/', { channel: false })
    await settle()
    // The tab without BroadcastChannel waits for a peer's token, then refreshes itself.
    env.clock.advance(2000)
    await vi.waitFor(() => expect(meCalls(env).length).toBe(3))
    const current = env.session()!.refresh_token
    const snapshot = await a.account.signOut()
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.user).toBeNull()
    expect(env.local.map.has(SESSION)).toBe(false)
    expect(env.local.map.has(PROFILE)).toBe(false)
    const revoke = env.pi.calls.find(call => call.path === '/id/revoke')!
    expect(Object.fromEntries(revoke.body!)).toEqual({ token: current, token_type_hint: 'refresh_token', client_id: CLIENT_ID })
    expect(env.pi.refreshState(current)?.revokeReason).toBe('revoked_by_client')
    await vi.waitFor(() => expect(b.account.status()).toBe('signed-out'))
    await vi.waitFor(() => expect(c.account.status()).toBe('signed-out'))
    expect(env.hub.posted).toContainEqual({ type: 'signed-out' })
  })

  it('sign-out clears local state even when revocation fails', async () => {
    const env = new Env()
    env.signedIn()
    const tab = env.open('/van-ban/')
    await settle()
    env.pi.offline = true
    expect((await tab.account.signOut()).status).toBe('signed-out')
    expect(env.local.map.has(SESSION)).toBe(false)
  })
})

describe('organizations', () => {
  async function signedInTab(env: Env, path = '/van-ban/', org: string | null = null) {
    const token = env.signedIn(AN, org)
    const tab = env.open(path)
    await vi.waitFor(() => expect(tab.account.orgs()).toHaveLength(1))
    return { tab, token }
  }

  it('lists active memberships only', async () => {
    const env = new Env()
    const { tab } = await signedInTab(env)
    expect(tab.account.orgs()).toEqual([{ id: ORG_XD, name: 'Công ty Xây dựng Ví dụ', role: 'member' }])
    expect(tab.account.activeOrg()).toBeNull()
  })

  it('switching runs PI\'s authorize again with org_hint, then revokes the previous token family', async () => {
    const env = new Env()
    const { tab } = await signedInTab(env)
    const other = env.open('/bang-tinh/')
    const before = env.session()!.refresh_token
    const done = tab.account.selectOrg(ORG_XD)
    expect(tab.opened.at(-1)!.url).toBe(`/dang-nhap/?ui_locales=vi&org_hint=${ORG_XD}`)
    // The user stays signed in while the popup runs.
    expect(tab.account.status()).toBe('signed-in')
    const { authorize } = await completePopup(env, tab, done)
    expect(authorize.searchParams.get('org_hint')).toBe(ORG_XD)
    const snapshot = await done
    // PI's session is alive and the hint matches: no PI page at all.
    expect(env.pi.pages).toEqual([])
    expect(snapshot.activeOrg).toEqual({ id: ORG_XD, name: 'Công ty Xây dựng Ví dụ', role: 'member' })
    expect(env.session()!.org_context).toBe(ORG_XD)
    expect(env.pi.verifyJwt(bearerOf(meCalls(env).at(-1)!))?.org_context).toBe(ORG_XD)
    await vi.waitFor(() => expect(env.pi.refreshState(before)?.revokeReason).toBe('revoked_by_client'))
    await vi.waitFor(() => expect(other.account.activeOrg()?.id).toBe(ORG_XD))
    // PI cannot switch on refresh (it ignores the parameter), so none is ever sent.
    expect(env.pi.grants('refresh_token').every(c => !c.body!.has('org_context'))).toBe(true)
  })

  it('back to personal goes through PI\'s organization page', async () => {
    const env = new Env()
    const { tab } = await signedInTab(env, '/van-ban/', ORG_XD)
    const done = tab.account.selectOrg(null)
    expect(tab.opened.at(-1)!.url).toBe('/dang-nhap/?ui_locales=vi&prompt=select_account')
    const { authorize } = await completePopup(env, tab, done, { choose: 'personal' })
    expect(authorize.searchParams.get('prompt')).toBe('select_account')
    const snapshot = await done
    expect(env.pi.pages).toEqual(['org'])
    expect(snapshot.activeOrg).toBeNull()
    expect(env.session()!.org_context).toBeNull()
  })

  it('the organization PI ends up with wins, even when it is the one already active', async () => {
    const env = new Env()
    const { tab, token } = await signedInTab(env, '/van-ban/', ORG_XD)
    const done = tab.account.selectOrg(null)
    await completePopup(env, tab, done, { choose: ORG_XD })
    const snapshot = await done
    expect(snapshot.status).toBe('signed-in')
    expect(snapshot.activeOrg?.id).toBe(ORG_XD)
    await vi.waitFor(() => expect(env.pi.refreshState(token)?.revokedAt).not.toBeNull())
  })

  it('refuses an organization the user is not an active member of, without a popup or request', async () => {
    const env = new Env()
    const { tab } = await signedInTab(env)
    const calls = env.pi.calls.length
    const snapshot = await tab.account.selectOrg(ORG_OLD)
    expect(snapshot.error?.code).toBe('unknown_org')
    expect(tab.opened).toEqual([])
    expect(env.pi.calls.length).toBe(calls)
  })

  it('a blocked popup keeps the current organization and says why', async () => {
    const env = new Env()
    env.signedIn(AN, ORG_XD)
    const tab = env.open('/van-ban/', { popupBlocked: true })
    await vi.waitFor(() => expect(tab.account.orgs()).toHaveLength(1))
    const snapshot = await tab.account.selectOrg(null)
    expect(snapshot.error?.code).toBe('popup_blocked')
    expect(snapshot.status).toBe('signed-in')
    expect(snapshot.activeOrg?.id).toBe(ORG_XD)
  })
})

describe('entitlements and allowed()', () => {
  it('everything is free today: guests and signed-in users get every built-in feature', async () => {
    const env = new Env()
    const guest = env.open('/van-ban/')
    for (const feature of ['vanban.view', 'vanban.export', 'vanban.use', 'pdf.use']) expect(guest.account.allowed(feature)).toBe(true)
    env.signedIn()
    const user = env.open('/van-ban/')
    await settle()
    expect(user.account.allowed('vanban.use')).toBe(true)
  })

  it('a signed-in editor tab calls neither entitlements nor a feature catalog: PI has neither for Office', async () => {
    const env = new Env()
    env.signedIn()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    expect(tab.account.allowed('vanban.use')).toBe(true)
    env.clock.advance(60 * MINUTE)
    await settle()
    expect(new Set(env.pi.calls.map(c => c.path))).toEqual(new Set(['/id/token', ME_PATH]))
    expect(tab.errors).toEqual([])
  })

  it('a pro feature (planned catalog): denied to guests, allowed with a fresh entitlement, denied offline after 10 min', async () => {
    const env = new Env()
    env.servePlanned()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.catalogs.vanban = await signCatalog(key, catalogPayload(3, { 'vanban.use': 'pro', 'vanban.view': 'free' }))
    const guest = env.open('/van-ban/')
    await vi.waitFor(() => expect(guest.account.allowed('vanban.use')).toBe(false))
    expect(guest.account.allowed('vanban.view')).toBe(true)
    expect(guest.account.allowed('vanban.export')).toBe(true)

    env.signedIn()
    const withoutRight = env.open('/van-ban/')
    await vi.waitFor(() => {
      withoutRight.account.allowed('vanban.use')
      expect(withoutRight.account.snapshot().entitlementsFresh).toBe(true)
    })
    expect(withoutRight.account.allowed('vanban.use')).toBe(false)

    env.entitlements[`${AN}|`] = [entitlement('vanban.use')]
    const pro = env.open('/van-ban/')
    await vi.waitFor(() => expect(pro.account.allowed('vanban.use')).toBe(true))
    expect(pro.account.entitlements()).toEqual([{ id: 'ent_vanban.use', feature: 'vanban.use', scope: 'personal', orgId: null, validTo: null, offlineAllowed: false }])

    env.pi.offline = true
    env.clock.advance(11 * MINUTE)
    expect(pro.account.allowed('vanban.use')).toBe(false)
    expect(pro.account.allowed('vanban.view')).toBe(true)
    await settle()
    expect(pro.account.status()).toBe('signed-in')
    expect(pro.account.snapshot().entitlementsFresh).toBe(false)
  })

  it('keeps view and export free even when a catalog marks them pro', async () => {
    const env = new Env()
    env.servePlanned()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.catalogs.vanban = await signCatalog(key, catalogPayload(4, { 'vanban.view': 'pro', 'vanban.export': 'pro', 'vanban.use': 'pro' }))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.allowed('vanban.use')).toBe(false))
    expect(tab.account.allowed('vanban.view')).toBe(true)
    expect(tab.account.allowed('vanban.export')).toBe(true)
    expect(tab.warnings.some(w => String(w[0]).includes('pinned-free'))).toBe(true)
  })

  it.each([
    ['a forged signature', async (key: TestKey) => (await signCatalog(key, catalogPayload(5, { 'vanban.use': 'pro' }))).replace(/.{4}$/, 'AAAA')],
    ['an unpinned kid', async (key: TestKey) => signCatalog(key, catalogPayload(5, { 'vanban.use': 'pro' }), { alg: 'EdDSA', kid: 'other', typ: 'pi-feature-catalog+jwt' })],
    ['a lease typ', async (key: TestKey) => signCatalog(key, catalogPayload(5, { 'vanban.use': 'pro' }), { alg: 'EdDSA', kid: 'test-1', typ: 'pi-lease+jwt' })],
    ['an extra jwk header', async (key: TestKey) => signCatalog(key, catalogPayload(5, { 'vanban.use': 'pro' }), { alg: 'EdDSA', kid: 'test-1', typ: 'pi-feature-catalog+jwt', jwk: {} })],
    ['another product', async (key: TestKey) => signCatalog(key, { ...catalogPayload(5, { 'vanban.use': 'pro' }), product: 'pdf' })],
    ['another issuer', async (key: TestKey) => signCatalog(key, { ...catalogPayload(5, { 'vanban.use': 'pro' }), iss: 'https://evil.example' })],
  ])('ignores a catalog with %s and keeps the built-in tiers', async (_name, make) => {
    const env = new Env()
    env.servePlanned()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.catalogs.vanban = await make(key)
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(env.pi.calls.some(c => c.path.endsWith('/feature-catalog'))).toBe(true))
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(true)
    expect(env.local.map.has('erpcons-pi-catalog:vanban')).toBe(false)
  })

  it('never goes back to a lower catalog version than the cached one', async () => {
    const env = new Env()
    env.servePlanned()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.local.map.set('erpcons-pi-catalog:vanban', JSON.stringify({ jws: await signCatalog(key, catalogPayload(7, { 'vanban.use': 'pro' })) }))
    env.catalogs.vanban = await signCatalog(key, catalogPayload(6, { 'vanban.use': 'free' }))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(env.pi.calls.some(c => c.path.endsWith('/feature-catalog'))).toBe(true))
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(false)
  })

  it('accepts the contract example catalog with its example key (lease.md §12)', async () => {
    const env = new Env()
    env.servePlanned()
    env.config = { ...env.config, catalogKeys: { 'pi-lease-example-1': '9NYv3EVAYbyMCnyywdUpJU99yTSSE44tQ_XASMni0gA' } }
    env.catalogs.vanban = CONTRACT_CATALOG
    env.open('/van-ban/')
    await vi.waitFor(() => expect(env.local.json('erpcons-pi-catalog:vanban')).toEqual({ jws: CONTRACT_CATALOG }))
  })

  it('skips the catalog fetch when no platform key is pinned', async () => {
    const env = new Env()
    env.open('/van-ban/')
    await settle()
    expect(env.pi.calls).toEqual([])
  })

  it('discards a list that carries another tenant (SEV0) and denies the pro feature', async () => {
    const env = new Env()
    env.servePlanned()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.catalogs.vanban = await signCatalog(key, catalogPayload(2, { 'vanban.use': 'pro' }))
    env.entitlements[`${AN}|`] = [entitlement('vanban.use', 'org_other')]
    env.signedIn()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => {
      tab.account.allowed('vanban.use')
      expect(entitlementCalls(env)).toHaveLength(1)
    })
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(false)
    expect(tab.account.entitlements()).toEqual([])
    expect(tab.errors.some(e => String(e[0]).includes('tenant isolation'))).toBe(true)
  })
})

describe('PI API errors ({ok:false, message, code?})', () => {
  it('401 without a code: refreshes once and retries the request', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(401, 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.') : undefined))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    expect(env.pi.grants('refresh_token')).toHaveLength(2)
    expect(tab.account.status()).toBe('signed-in')
    expect(bearerOf(meCalls(env)[0])).not.toBe(bearerOf(meCalls(env)[1]))
  })

  it('401 that persists after the refresh does not loop', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(401, 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.') : undefined), false)
    env.open('/', {})
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    await settle()
    expect(meCalls(env)).toHaveLength(2)
  })

  it.each([
    ['INSUFFICIENT_SCOPE', 'insufficient_scope', 'đăng nhập lại'],
    ['ACCOUNT_LOCKED', 'user_suspended', 'tạm khóa'],
  ])('403 %s signs out locally and says why', async (piCode, code, text) => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(403, 'Từ chối.', piCode) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe(code)
    expect(tab.account.snapshot().error?.message.toLowerCase()).toContain(text)
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it('403 MEMBERSHIP_INACTIVE: PI will refuse this token family too, so it is revoked and the user asked to sign in', async () => {
    const env = new Env()
    const token = env.signedIn(AN, ORG_XD)
    env.pi.on(call => (call.path === ME_PATH ? piError(403, 'Bạn không còn là thành viên hoạt động của tổ chức trong token.', 'MEMBERSHIP_INACTIVE') : undefined))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe('membership_inactive')
    expect(tab.account.snapshot().error?.message).toContain('đăng nhập lại')
    expect(tab.opened).toEqual([])
    const rotated = env.pi.grants('refresh_token')[0]
    expect(rotated.body!.get('refresh_token')).toBe(token)
    await vi.waitFor(() => expect(env.pi.calls.some(c => c.path === '/id/revoke')).toBe(true))
  })

  it('the old contract\'s lowercase codes mean nothing to PI: 403 user_suspended reads as forbidden', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? json(403, { code: 'user_suspended' }) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('forbidden'))
    expect(tab.account.status()).toBe('signed-in')
  })

  it('403 without a code: forbidden, free features only and no automatic retry', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(403, 'Bạn không có quyền thực hiện thao tác này.') : undefined), false)
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('forbidden'))
    env.clock.advance(60 * MINUTE)
    expect(tab.account.allowed('vanban.use')).toBe(true)
    await settle()
    expect(meCalls(env)).toHaveLength(1)
  })

  it('429: PI does not expose Retry-After to the page, so it backs off with jitter', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(429, 'Quá nhiều yêu cầu.', undefined, { 'Retry-After': '120' }) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('rate_limited'))
    expect(tab.account.snapshot().error?.retryAfter).toBeNull()
    env.clock.advance(1000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
  })

  it('503 backs off with jitter from 1 s and keeps the user signed in', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(503, 'Dịch vụ tạm thời không phản hồi.') : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('dependency_unavailable'))
    expect(tab.account.status()).toBe('signed-in')
    env.clock.advance(1000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
  })

  it('clears the outage note once the retry succeeds', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(503, 'Dịch vụ tạm thời không phản hồi.') : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('dependency_unavailable'))
    env.clock.advance(1000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    await vi.waitFor(() => expect(tab.account.snapshot().error).toBeNull())
    expect(tab.account.status()).toBe('signed-in')
  })

  it('an unknown code falls back to its HTTP status', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH ? piError(503, 'Lỗi.', 'BRAND_NEW_CODE') : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('dependency_unavailable'))
  })

  it('a /me body in the old contract shape is not accepted as a user', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === ME_PATH
      ? json(200, { user_id: AN, display_name: 'Ai đó', email: null, status: 'active', org_context: null, memberships: [] })
      : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    await settle()
    expect(tab.account.user()?.name).toBe('Nguyễn Văn An')
  })
})

describe('snapshot', () => {
  it('is stable until something changes, frozen and JSON-able', async () => {
    const env = new Env()
    env.signedIn()
    const tab = env.open('/van-ban/')
    await settle()
    const a = tab.account.snapshot()
    expect(tab.account.snapshot()).toBe(a)
    expect(Object.isFrozen(a)).toBe(true)
    expect(JSON.parse(JSON.stringify(a))).toEqual(a)
    expect(a).toMatchObject({ version: 1, product: 'vanban', status: 'signed-in' })
    const seen: AccountSnapshot[] = []
    const stop = tab.account.onChange(s => seen.push(s))
    await tab.account.signOut()
    expect(seen.at(-1)?.status).toBe('signed-out')
    stop()
    const count = seen.length
    await tab.account.signOut()
    expect(seen).toHaveLength(count)
  })

  it('knows its product from the editor path and none on the landing', () => {
    const env = new Env()
    expect(env.open('/trinh-chieu/').account.snapshot().product).toBe('trinhchieu')
    expect(env.open('/').account.snapshot().product).toBeNull()
  })
})

describe('apiFetch (Office API, docs/erp-host.md)', () => {
  const auth = (call: { init: RequestInit }) => (call.init.headers as Record<string, string>).Authorization

  it('sends the access token to a same-origin /api/v1/ path only, absolute, without cookies or redirects', async () => {
    const env = new Env()
    env.signedIn()
    env.site = async () => json(200, { ok: true })
    const tab = env.open('/van-ban/?doc=1')
    const response = await tab.account.apiFetch('/api/v1/documents/abc?x=1', { method: 'PUT', headers: { 'If-Match': '"e1"', Authorization: 'Bearer stolen' }, body: 'x' })
    expect(response.status).toBe(200)
    expect(env.siteCalls).toHaveLength(1)
    const [call] = env.siteCalls
    expect(call.url).toBe(`${SITE_ORIGIN}/api/v1/documents/abc?x=1`)
    expect(call.init).toMatchObject({ method: 'PUT', credentials: 'omit', cache: 'no-store', redirect: 'error', body: 'x' })
    expect(call.init.headers).toEqual({ 'If-Match': '"e1"', Authorization: auth(call) })
    const token = auth(call).replace(/^Bearer /, '')
    expect(token).toMatch(JWT)
    // What the online backend checks: PI's EdDSA signature, `aud` ∋ pi-platform and `azp` = the web client.
    expect(env.pi.verifyJwt(token)).toMatchObject({ iss: ISSUER, sub: AN, aud: [AUDIENCE], azp: CLIENT_ID })
  })

  it.each([
    'https://evil.example/api/v1/documents',
    '//evil.example/api/v1/documents',
    '/\\evil.example/api/v1/documents',
    '\\\\evil.example/api/v1/documents',
    'api/v1/documents',
    '/api/v2/documents',
    '/api/v1',
    '/api/v1/../../dang-nhap/',
    '/api/v1/%2e%2e/%2e%2e/x',
    '/apiv1/documents',
    `${SITE_ORIGIN}/api/v1/documents`,
    'https://user:pw@office.erpcons.ai/api/v1/documents',
    '/api/v1/documents#frag',
  ])('refuses %s by throwing, before any request or token refresh', async (path) => {
    const env = new Env()
    env.signedIn()
    env.site = async () => json(200, {})
    const tab = env.open('/van-ban/')
    await settle()
    const grants = env.pi.grants('refresh_token').length
    const piCalls = env.pi.calls.length
    expect(() => tab.account.apiFetch(path)).toThrow('invalid_api_path')
    await settle()
    expect(env.siteCalls).toHaveLength(0)
    expect(env.pi.grants('refresh_token')).toHaveLength(grants)
    expect(env.pi.calls).toHaveLength(piCalls)
  })

  it('takes leading-slash paths only, checked after the browser normalises them', async () => {
    const env = new Env()
    env.signedIn()
    env.site = async () => json(200, {})
    const tab = env.open('/van-ban/')
    // Leading-slash paths only: an absolute URL is refused even when it names this origin.
    expect(() => tab.account.apiFetch(`${SITE_ORIGIN}/api/v1/me`)).toThrow('invalid_api_path')
    await tab.account.apiFetch('/api/v1/./documents/%2e/abc')
    expect(env.siteCalls.map(c => c.url)).toEqual([`${SITE_ORIGIN}/api/v1/documents/abc`])
  })

  it('a 401 refreshes once and retries with the new token, then answers', async () => {
    const env = new Env()
    env.signedIn()
    let calls = 0
    env.site = async () => (++calls === 1 ? json(401, { code: 'UNAUTHENTICATED' }) : json(200, { ok: true }))
    const tab = env.open('/van-ban/')
    await settle()
    const grants = env.pi.grants('refresh_token').length
    const response = await tab.account.apiFetch('/api/v1/me')
    expect(response.status).toBe(200)
    expect(env.siteCalls).toHaveLength(2)
    expect(env.pi.grants('refresh_token')).toHaveLength(grants + 1)
    expect(auth(env.siteCalls[0])).not.toBe(auth(env.siteCalls[1]))
  })

  it('a second 401 rejects with unauthenticated, without looping, and keeps the session', async () => {
    const env = new Env()
    env.signedIn()
    env.site = async () => json(401, { code: 'UNAUTHENTICATED' })
    const tab = env.open('/van-ban/')
    await settle()
    await expect(tab.account.apiFetch('/api/v1/me')).rejects.toMatchObject({ code: 'unauthenticated', status: 401 })
    await settle()
    expect(env.siteCalls).toHaveLength(2)
    expect(tab.account.status()).toBe('signed-in')
  })

  it('rejects with signed_out when nobody is signed in, and network when the server is unreachable', async () => {
    const env = new Env()
    const guest = env.open('/van-ban/')
    await expect(guest.account.apiFetch('/api/v1/me')).rejects.toMatchObject({ code: 'signed_out' })
    const disabled = env.open('/van-ban/', { config: null })
    await expect(disabled.account.apiFetch('/api/v1/me')).rejects.toMatchObject({ code: 'signed_out' })
    expect(env.siteCalls).toHaveLength(0)
    env.signedIn()
    const tab = env.open('/van-ban/')
    await expect(tab.account.apiFetch('/api/v1/me')).rejects.toMatchObject({ code: 'network' })
  })

  it('never puts the token anywhere but the Authorization header of /api/v1/ requests', async () => {
    const env = new Env()
    env.signedIn()
    let calls = 0
    env.site = async () => (++calls === 1 ? json(401, {}) : json(200, {}))
    const tab = env.open('/van-ban/')
    await tab.account.apiFetch('/api/v1/documents/x/content', { method: 'GET' })
    const tokens = env.siteCalls.map(c => auth(c).slice('Bearer '.length))
    // The token is PI ID's own: besides /api/v1/ it only ever goes back to the issuer, and never in a URL.
    for (const call of env.pi.calls) {
      expect(new URL(call.url).origin).toBe(ISSUER)
      for (const token of tokens) expect(call.url).not.toContain(token)
    }
    for (const call of env.siteCalls) for (const token of tokens) expect(call.url).not.toContain(token)
    expect(JSON.stringify([...env.local.map.values()])).not.toContain(tokens[0])
    expect(JSON.stringify([tab.warnings, tab.errors])).not.toContain(tokens[0])
    expect(tab.account.version).toBe(1)
  })
})

// --- Catalog helpers -----------------------------------------------------------------------------------------

interface TestKey { pair: CryptoKeyPair; x: string }
const CONTRACT_CATALOG = 'eyJhbGciOiJFZERTQSIsImtpZCI6InBpLWxlYXNlLWV4YW1wbGUtMSIsInR5cCI6InBpLWZlYXR1cmUtY2F0YWxvZytqd3QifQ.eyJpc3MiOiJodHRwczovL2lkLnBpLmludmFsaWQiLCJwcm9kdWN0IjoidmFuYmFuIiwiY2F0YWxvZ192ZXJzaW9uIjoxLCJpYXQiOjE3OTI4Mjg4MDAsImZlYXR1cmVzIjpbeyJmZWF0dXJlIjoidmFuYmFuLnZpZXciLCJ0aWVyIjoiZnJlZSJ9LHsiZmVhdHVyZSI6InZhbmJhbi5leHBvcnQiLCJ0aWVyIjoiZnJlZSJ9LHsiZmVhdHVyZSI6InZhbmJhbi51c2UiLCJ0aWVyIjoiZnJlZSJ9XX0.8KO9EMOFTwp8lnncsJmUr2os3nqQJLQexN5RS-8BfCU00lHKM7wsTYlY8mZMx_rFsHrqmwMtN5T7luGA_9iIBg'

async function catalogKey(): Promise<TestKey> {
  const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']) as CryptoKeyPair
  return { pair, x: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url') }
}

function catalogPayload(version: number, tiers: Record<string, 'free' | 'pro'>) {
  return { iss: ISSUER, product: 'vanban', catalog_version: version, iat: 1792828800, features: Object.entries(tiers).map(([feature, tier]) => ({ feature, tier })) }
}

async function signCatalog(key: TestKey, payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'EdDSA', kid: 'test-1', typ: 'pi-feature-catalog+jwt' }) {
  const head = Buffer.from(JSON.stringify(header)).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = await crypto.subtle.sign({ name: 'Ed25519' }, key.pair.privateKey, Buffer.from(`${head}.${body}`))
  return `${head}.${body}.${Buffer.from(signature).toString('base64url')}`
}

function entitlement(feature: string, org: string | null = null) {
  return {
    entitlement_id: `ent_${feature}`, product_id: feature.split('.')[0], feature, scope: org ? 'organization' : 'personal', org_id: org,
    quota: null, seats: org ? 50 : null, valid_from: '2026-10-01T00:00:00Z', valid_to: null, offline_allowed: false, offline_days: null, policy_version: '2026-10-01.1',
  }
}
