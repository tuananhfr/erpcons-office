import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { piConfig, type PiConfig } from '../src/config/pi.ts'
import type { AccountSnapshot, ErpAccount } from '../src/lib/account/types.ts'
import { ChannelHub, ManualClock, MemoryStorage, SharedLocks, SharedStorage, settle } from './fake-browser.ts'
import { CLIENT_ID, FakePi, ISSUER, REDIRECT_URI, SITE_ORIGIN, json, problem } from './fake-pi.ts'

const SOURCE = fs.readFileSync(fileURLToPath(new URL('account.js', import.meta.url)), 'utf8')
const SESSION = 'erpcons-pi-session'
const PROFILE = 'erpcons-pi-profile'
const MINUTE = 60_000
const SCOPES = 'openid profile email offline_access pi.entitlements'

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
  config: PiConfig = piConfig(true)!

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
      URLSearchParams, TextEncoder, TextDecoder, Uint8Array, atob, btoa,
      crypto: {
        subtle: globalThis.crypto.subtle,
        getRandomValues: (bytes: Uint8Array) => (random ? random(bytes) : globalThis.crypto.getRandomValues(bytes), bytes),
      },
      Date: { now: () => this.clock.now },
      performance: { now: () => this.clock.now },
      setTimeout: this.clock.setTimeout, clearTimeout: this.clock.clearTimeout,
      setInterval: this.clock.setInterval, clearInterval: this.clock.clearInterval,
      fetch: this.pi.fetch,
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

  /** A session left by an earlier sign-in (refresh token known to the fake platform). */
  signedIn(sub = 'usr_an', org: string | null = null): string {
    const token = this.pi.seedRefreshToken(sub, org)
    this.local.map.set(SESSION, JSON.stringify({ v: 1, refresh_token: token, gen: 'seed', sub, org_context: org }))
    this.local.map.set(PROFILE, JSON.stringify({ v: 1, sub, user: { id: sub, name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' }, orgs: [] }))
    return token
  }

  session() { return this.local.json<{ refresh_token: string; org_context: string | null; gen: string }>(SESSION) }
}

/** Opener clicks Đăng nhập, the popup runs /dang-nhap/, PI ID answers, the popup runs the callback. */
async function popupSignIn(env: Env, opener: Tab, edit: (callbackUrl: string) => string = (u) => u) {
  const done = opener.account.signIn()
  const popup = opener.opened[opener.opened.length - 1]
  const session = new MemoryStorage()
  const start = env.open(popup.url, { session, popup })
  await vi.waitFor(() => expect(start.replaced).toHaveLength(1))
  const callbackUrl = edit(env.pi.authorize(start.replaced[0]))
  const callback = env.open(callbackUrl, { session, popup })
  await settle()
  return { done, popup, start, callback, session }
}

const meCalls = (env: Env) => env.pi.calls.filter(c => c.path === '/v1/me')
const entitlementCalls = (env: Env) => env.pi.calls.filter(c => c.path === '/v1/me/entitlements')

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
    expect((await tab.account.selectOrg('org_xd')).status).toBe('disabled')
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

  it('sends an S256 challenge of the verifier it keeps in the popup (RFC 7636 appendix B)', async () => {
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
    expect(pending.verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(request.searchParams.get('code_challenge')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    expect(Object.fromEntries(request.searchParams)).toMatchObject({
      response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPES,
      code_challenge_method: 'S256', state: pending.state, nonce: pending.nonce, ui_locales: 'vi',
    })
    expect(request.searchParams.has('org_context')).toBe(false)
    expect(request.searchParams.get('scope')).not.toContain('pi.devices')
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

  it('delivers the tokens to the opener and the other tabs, then closes', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const other = env.open('/bang-tinh/')
    const { done, popup, callback } = await popupSignIn(env, opener)
    const snapshot = await done
    expect(snapshot.status).toBe('signed-in')
    expect(popup.closed).toBe(true)
    // The one-time code leaves the address bar before anything else happens.
    expect(callback.history).toEqual(['/dang-nhap/callback/'])
    await vi.waitFor(() => expect(opener.account.user()).toEqual({ id: 'usr_an', name: 'Nguyễn Văn An', email: 'an.nguyen@example.com' }))
    await vi.waitFor(() => expect(other.account.status()).toBe('signed-in'))
    // The broadcast access token is used as is: no refresh grant in any tab.
    expect(env.pi.grants('authorization_code')).toHaveLength(1)
    expect(env.pi.grants('refresh_token')).toHaveLength(0)
    const bearer = meCalls(env)[0].headers.Authorization
    expect(bearer).toMatch(/^Bearer at-/)
    expect(meCalls(env).every(c => c.headers.Authorization === bearer)).toBe(true)
    // Access token in memory only: never written to any storage.
    const token = bearer.slice('Bearer '.length)
    expect([...env.local.map.values()].join('\n')).not.toContain(token)
    expect(env.session()?.refresh_token).toMatch(/^rt-/)
    const exchange = env.pi.grants('authorization_code')[0].body!
    expect(exchange.get('redirect_uri')).toBe(REDIRECT_URI)
    expect(exchange.get('client_id')).toBe(CLIENT_ID)
  })

  it('rejects a callback whose state does not match the popup, without exchanging the code', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener, (url) => url.replace(/state=[^&]+/, 'state=forged'))
    const snapshot = await done
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error?.code).toBe('state_mismatch')
    expect(callback.page.error.hidden).toBe(false)
    expect(callback.page.message.textContent).toContain('không hợp lệ')
    expect(callback.page.close.focused).toBe(true)
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

  it('treats "access denied" at PI ID as a cancel: the popup closes, no error loop', async () => {
    const env = new Env()
    const opener = env.open('/van-ban/')
    const { done, callback } = await popupSignIn(env, opener, (url) => url.replace(/code=[^&]+/, 'error=access_denied'))
    const snapshot = await done
    expect(snapshot.status).toBe('signed-out')
    expect(snapshot.error).toBeNull()
    expect(callback.closeCalls).toBe(1)
    expect(env.pi.grants('authorization_code')).toHaveLength(0)
  })

  it('refuses an issuer whose discovery document names another issuer or lacks S256', async () => {
    for (const doc of [{ issuer: 'https://evil.example' }, { code_challenge_methods_supported: ['plain'] }]) {
      const env = new Env()
      env.pi.on(call => (call.path === '/.well-known/openid-configuration'
        ? json(200, { issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, code_challenge_methods_supported: ['S256'], ...doc })
        : undefined))
      const opener = env.open('/van-ban/')
      const done = opener.account.signIn()
      const start = env.open(opener.opened[0].url, { popup: opener.opened[0] })
      const snapshot = await done
      expect(start.replaced).toEqual([])
      expect(start.page.error.hidden).toBe(false)
      expect(snapshot.error?.code).toBe('discovery_failed')
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
    // No broadcast token: this tab gets its own through one serialized refresh.
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
  })
})

describe('tokens across tabs', () => {
  it('rotates the refresh token on start-up and stores the new one', async () => {
    const env = new Env()
    const seeded = env.signedIn()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(1))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    expect(env.pi.grants('refresh_token')[0].body!.get('refresh_token')).toBe(seeded)
    expect(env.pi.grants('refresh_token')[0].body!.has('org_context')).toBe(false)
    const stored = env.session()!.refresh_token
    expect(stored).not.toBe(seeded)
    expect(env.pi.refreshState(seeded)?.used).toBe(true)
    expect(env.pi.refreshState(stored)?.used).toBe(false)
    expect(tab.account.status()).toBe('signed-in')
  })

  it('two tabs needing a token at once make a single network refresh', async () => {
    const env = new Env()
    env.signedIn()
    const a = env.open('/van-ban/')
    const b = env.open('/bang-tinh/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    expect(new Set(meCalls(env).map(c => c.headers.Authorization)).size).toBe(1)
    expect(env.locks!.requests.filter(name => name === 'erpcons-pi-refresh').length).toBeGreaterThanOrEqual(2)
    expect(a.account.status()).toBe('signed-in')
    expect(b.account.status()).toBe('signed-in')
    expect(env.pi.refreshState(env.session()!.refresh_token)?.used).toBe(false)
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

  it('refreshes again once the 5 min access token expires', async () => {
    const env = new Env()
    env.signedIn()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(2, { 'vanban.use': 'pro' }))
    env.pi.entitlements['usr_an|'] = [entitlement('vanban.use')]
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(env.local.map.has('erpcons-pi-catalog:vanban')).toBe(true))
    await vi.waitFor(() => expect(tab.account.allowed('vanban.use')).toBe(true))
    expect(env.pi.grants('refresh_token')).toHaveLength(1)
    env.clock.advance(11 * MINUTE)
    expect(tab.account.allowed('vanban.use')).toBe(false)
    await vi.waitFor(() => expect(tab.account.allowed('vanban.use')).toBe(true))
    expect(env.pi.grants('refresh_token')).toHaveLength(2)
  })

  it('a replayed (reuse-detected) refresh token signs every tab out cleanly, with no retry loop', async () => {
    const env = new Env()
    const seeded = env.signedIn()
    // Someone else already used this token: presenting it again revokes the family.
    await env.pi.fetch(`${ISSUER}/token`, { method: 'POST', credentials: 'omit', body: `grant_type=refresh_token&refresh_token=${seeded}&client_id=${CLIENT_ID}` })
    const tab = env.open('/van-ban/')
    const other = env.open('/', { channel: false })
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe('session_expired')
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

  it('sign-out revokes the refresh token, clears storage and signs the other tabs out', async () => {
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
    const revoke = env.pi.calls.find(call => call.path === '/revoke')!
    expect(Object.fromEntries(revoke.body!)).toEqual({ token: current, token_type_hint: 'refresh_token', client_id: CLIENT_ID })
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
  async function signedInTab(env: Env, path = '/van-ban/') {
    env.signedIn()
    const tab = env.open(path)
    await vi.waitFor(() => expect(tab.account.orgs()).toHaveLength(1))
    return tab
  }

  it('lists active memberships only', async () => {
    const env = new Env()
    const tab = await signedInTab(env)
    expect(tab.account.orgs()).toEqual([{ id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member' }])
    expect(tab.account.activeOrg()).toBeNull()
  })

  it('switching re-requests tokens with org_context, then reloads identity and entitlements', async () => {
    const env = new Env()
    env.pi.entitlements['usr_an|org_xd'] = [entitlement('vanban.use', 'org_xd')]
    const tab = await signedInTab(env)
    const other = env.open('/bang-tinh/')
    const me = meCalls(env).length
    const ents = entitlementCalls(env).length
    const snapshot = await tab.account.selectOrg('org_xd')
    const grant = env.pi.grants('refresh_token').at(-1)!.body!
    expect(grant.get('org_context')).toBe('org_xd')
    expect(snapshot.activeOrg).toEqual({ id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member' })
    expect(env.session()!.org_context).toBe('org_xd')
    expect(meCalls(env).length).toBeGreaterThan(me)
    expect(entitlementCalls(env).length).toBeGreaterThan(ents)
    expect(snapshot.entitlements.map(e => e.feature)).toEqual(['vanban.use'])
    expect(snapshot.entitlements[0]).toMatchObject({ scope: 'organization', orgId: 'org_xd' })
    await vi.waitFor(() => expect(other.account.activeOrg()?.id).toBe('org_xd'))

    const personal = await tab.account.selectOrg(null)
    expect(env.pi.grants('refresh_token').at(-1)!.body!.get('org_context')).toBe('personal')
    expect(personal.activeOrg).toBeNull()
    expect(personal.entitlements).toEqual([])
  })

  it('refuses an organization the user is not an active member of, without a request', async () => {
    const env = new Env()
    const tab = await signedInTab(env)
    const calls = env.pi.calls.length
    const snapshot = await tab.account.selectOrg('org_old')
    expect(snapshot.error?.code).toBe('unknown_org')
    expect(env.pi.calls.length).toBe(calls)
  })

  it('a membership ended on the server: stays signed in, personal context, explains why', async () => {
    const env = new Env()
    const tab = await signedInTab(env)
    env.pi.users.usr_an.memberships = []
    const snapshot = await tab.account.selectOrg('org_xd')
    expect(snapshot.status).toBe('signed-in')
    expect(snapshot.activeOrg).toBeNull()
    expect(snapshot.error?.code).toBe('membership_inactive')
    expect(env.pi.grants('refresh_token').at(-1)!.body!.has('org_context')).toBe(false)
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

  it('a pro feature: denied to guests, allowed with a fresh entitlement, denied when offline for over 10 min', async () => {
    const env = new Env()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(3, { 'vanban.use': 'pro', 'vanban.view': 'free' }))
    const guest = env.open('/van-ban/')
    await vi.waitFor(() => expect(guest.account.allowed('vanban.use')).toBe(false))
    expect(guest.account.allowed('vanban.view')).toBe(true)
    expect(guest.account.allowed('vanban.export')).toBe(true)

    env.signedIn()
    const withoutRight = env.open('/van-ban/')
    await vi.waitFor(() => expect(withoutRight.account.snapshot().entitlementsFresh).toBe(true))
    expect(withoutRight.account.allowed('vanban.use')).toBe(false)

    env.pi.entitlements['usr_an|'] = [entitlement('vanban.use')]
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
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(4, { 'vanban.view': 'pro', 'vanban.export': 'pro', 'vanban.use': 'pro' }))
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
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await make(key)
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(env.pi.calls.some(c => c.path.endsWith('/feature-catalog'))).toBe(true))
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(true)
    expect(env.local.map.has('erpcons-pi-catalog:vanban')).toBe(false)
  })

  it('never goes back to a lower catalog version than the cached one', async () => {
    const env = new Env()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.local.map.set('erpcons-pi-catalog:vanban', JSON.stringify({ jws: await signCatalog(key, catalogPayload(7, { 'vanban.use': 'pro' })) }))
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(6, { 'vanban.use': 'free' }))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(env.pi.calls.some(c => c.path.endsWith('/feature-catalog'))).toBe(true))
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(false)
  })

  it('accepts the contract example catalog with its example key (lease.md §12)', async () => {
    const env = new Env()
    env.config = { ...env.config, catalogKeys: { 'pi-lease-example-1': '9NYv3EVAYbyMCnyywdUpJU99yTSSE44tQ_XASMni0gA' } }
    env.pi.catalogs.vanban = CONTRACT_CATALOG
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
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(2, { 'vanban.use': 'pro' }))
    env.pi.entitlements['usr_an|'] = [entitlement('vanban.use', 'org_other')]
    env.signedIn()
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(entitlementCalls(env)).toHaveLength(1))
    await settle()
    expect(tab.account.allowed('vanban.use')).toBe(false)
    expect(tab.account.entitlements()).toEqual([])
    expect(tab.errors.some(e => String(e[0]).includes('tenant isolation'))).toBe(true)
  })
})

describe('API errors (contract §3)', () => {
  it('401: refreshes once and retries the request', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? problem(401, 'unauthenticated') : undefined))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    expect(env.pi.grants('refresh_token')).toHaveLength(2)
    expect(tab.account.status()).toBe('signed-in')
    expect(meCalls(env)[0].headers.Authorization).not.toBe(meCalls(env)[1].headers.Authorization)
  })

  it('401 that persists after the refresh does not loop', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? problem(401, 'unauthenticated') : undefined), false)
    env.open('/', {})
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
    await settle()
    expect(meCalls(env)).toHaveLength(2)
  })

  it.each([
    ['insufficient_scope', 'đăng nhập lại'],
    ['user_suspended', 'tạm khóa'],
  ])('403 %s signs out locally and says why', async (code, text) => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? problem(403, code) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.status()).toBe('signed-out'))
    expect(tab.account.snapshot().error?.code).toBe(code)
    expect(tab.account.snapshot().error?.message.toLowerCase()).toContain(text)
    expect(env.local.map.has(SESSION)).toBe(false)
  })

  it('403 membership_inactive switches to the personal context', async () => {
    const env = new Env()
    env.signedIn('usr_an', 'org_xd')
    env.pi.on(call => (call.path === '/v1/me/entitlements' ? problem(403, 'membership_inactive') : undefined))
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('membership_inactive'))
    expect(env.pi.grants('refresh_token').at(-1)!.body!.get('org_context')).toBe('personal')
    expect(tab.account.activeOrg()).toBeNull()
    expect(tab.account.status()).toBe('signed-in')
  })

  it('403 forbidden: free features only and no automatic retry', async () => {
    const env = new Env()
    const key = await catalogKey()
    env.config = { ...env.config, catalogKeys: { 'test-1': key.x } }
    env.pi.catalogs.vanban = await signCatalog(key, catalogPayload(2, { 'vanban.use': 'pro' }))
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me/entitlements' ? problem(403, 'forbidden') : undefined), false)
    const tab = env.open('/van-ban/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('forbidden'))
    env.clock.advance(60 * MINUTE)
    expect(tab.account.allowed('vanban.use')).toBe(false)
    expect(tab.account.allowed('vanban.view')).toBe(true)
    await settle()
    expect(entitlementCalls(env)).toHaveLength(1)
  })

  it('429 waits for Retry-After before trying again', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? problem(429, 'rate_limited', { 'Retry-After': '120' }) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('rate_limited'))
    expect(tab.account.snapshot().error?.retryAfter).toBe(120)
    env.clock.advance(119_000)
    await settle()
    expect(meCalls(env)).toHaveLength(1)
    env.clock.advance(1000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
  })

  it('503 without Retry-After backs off with jitter from 1 s and keeps the user signed in', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? problem(503, 'dependency_unavailable') : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('dependency_unavailable'))
    expect(tab.account.status()).toBe('signed-in')
    env.clock.advance(1000)
    await vi.waitFor(() => expect(meCalls(env)).toHaveLength(2))
  })

  it('an unknown code falls back to its HTTP status', async () => {
    const env = new Env()
    env.signedIn()
    env.pi.on(call => (call.path === '/v1/me' ? json(503, { code: 'brand_new_code' }) : undefined))
    const tab = env.open('/')
    await vi.waitFor(() => expect(tab.account.snapshot().error?.code).toBe('dependency_unavailable'))
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
