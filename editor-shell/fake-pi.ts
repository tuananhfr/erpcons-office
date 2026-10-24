// A small in-memory PI Platform for account.js tests: discovery, PKCE code grant, rotating refresh tokens with
// reuse detection, revocation, /v1/me, /v1/me/entitlements and the signed feature catalog (contract.openapi.yaml).
import { createHash } from 'node:crypto'

export const ISSUER = 'https://id.pi.invalid'
export const CLIENT_ID = 'erpcons-office-web'
export const SITE_ORIGIN = 'https://office.erpcons.ai'
export const REDIRECT_URI = `${SITE_ORIGIN}/dang-nhap/callback/`

export interface Call { url: string; path: string; method: string; headers: Record<string, string>; body: URLSearchParams | null; query: URLSearchParams }
type Hook = (call: Call) => Response | undefined

export interface Membership { org_id: string; name: string; role: string; status: 'active' | 'invited' | 'suspended' }
export interface User { user_id: string; display_name: string; email: string | null; status: 'active' | 'suspended'; memberships: Membership[] }

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')
export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': '3c9a1e52-7f04-4d6b-8a2e-1b5c9d0f7e64', ...headers } })
export const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { type: `${ISSUER}/problems/${code}`, title: code, status, code, correlation_id: '3c9a1e52-7f04-4d6b-8a2e-1b5c9d0f7e64' }, { 'Content-Type': 'application/problem+json', ...headers })

export function unsignedJwt(payload: Record<string, unknown>): string {
  return `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(JSON.stringify(payload))}.c2ln`
}

interface Code { challenge: string; method: string; nonce: string; redirectUri: string; org: string | null; sub: string; used: boolean }
interface Refresh { sub: string; org: string | null; family: number; used: boolean }

export class FakePi {
  calls: Call[] = []
  offline = false
  hooks: { hook: Hook; once: boolean }[] = []
  catalogs: Record<string, string> = {}
  idTokenOverrides: Record<string, unknown> = {}
  users: Record<string, User> = {
    usr_an: {
      user_id: 'usr_an', display_name: 'Nguyễn Văn An', email: 'an.nguyen@example.com', status: 'active',
      memberships: [
        { org_id: 'org_xd', name: 'Công ty Xây dựng Ví dụ', role: 'member', status: 'active' },
        { org_id: 'org_old', name: 'Văn phòng Cũ', role: 'member', status: 'suspended' },
      ],
    },
  }
  // Keyed by `${sub}|${org ?? ''}`, entitlements for product `vanban`.
  entitlements: Record<string, Record<string, unknown>[]> = {}
  private codes = new Map<string, Code>()
  private refresh = new Map<string, Refresh>()
  private access = new Map<string, { sub: string; org: string | null; exp: number }>()
  private revokedFamilies = new Set<number>()
  private seq = 0
  private families = 0
  private now: () => number
  constructor(now: () => number) { this.now = now }

  /** Plays the PI ID sign-in page: checks the authorization request and returns the callback URL. */
  authorize(authorizeUrl: string, sub = 'usr_an'): string {
    const url = new URL(authorizeUrl)
    const q = url.searchParams
    if (url.origin + url.pathname !== `${ISSUER}/authorize`) throw new Error(`unexpected authorize endpoint ${url}`)
    for (const key of ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method']) {
      if (!q.get(key)) throw new Error(`authorize request without ${key}`)
    }
    if (q.get('code_challenge_method') !== 'S256') throw new Error('PKCE must be S256')
    const code = `code-${++this.seq}`
    this.codes.set(code, { challenge: q.get('code_challenge')!, method: 'S256', nonce: q.get('nonce')!, redirectUri: q.get('redirect_uri')!, org: q.get('org_context') === 'personal' ? null : q.get('org_context'), sub, used: false })
    return `${q.get('redirect_uri')}?code=${code}&state=${encodeURIComponent(q.get('state')!)}`
  }

  /** A refresh token as if the user had signed in earlier. */
  seedRefreshToken(sub = 'usr_an', org: string | null = null): string {
    const token = `rt-${++this.seq}`
    this.refresh.set(token, { sub, org, family: ++this.families, used: false })
    return token
  }
  refreshState(token: string) { return this.refresh.get(token) }
  revokeAll() { for (const r of this.refresh.values()) this.revokedFamilies.add(r.family) }
  expireAccessTokens() { for (const a of this.access.values()) a.exp = 0 }

  on(hook: Hook, once = true) { this.hooks.push({ hook, once }) }
  count(predicate: (call: Call) => boolean) { return this.calls.filter(predicate).length }
  grants(type: string) { return this.calls.filter(c => c.path === '/token' && c.body?.get('grant_type') === type) }

  fetch = async (input: string, init: { method?: string; headers?: Record<string, string>; body?: string; credentials?: string } = {}): Promise<Response> => {
    const url = new URL(input)
    const call: Call = {
      url: input, path: url.pathname, method: init.method ?? 'GET', headers: { ...init.headers },
      body: init.body ? new URLSearchParams(init.body) : null, query: url.searchParams,
    }
    this.calls.push(call)
    if (init.credentials !== 'omit') throw new Error('PI requests must not send cookies')
    if (this.offline || url.origin !== ISSUER) throw new TypeError('Failed to fetch')
    for (const entry of [...this.hooks]) {
      const response = entry.hook(call)
      if (response) {
        if (entry.once) this.hooks = this.hooks.filter(h => h !== entry)
        return response
      }
    }
    return this.route(call)
  }

  private issue(sub: string, org: string | null, family: number, nonce?: string) {
    const access = `at-${++this.seq}`
    const refresh = `rt-${++this.seq}`
    this.access.set(access, { sub, org, exp: this.now() + 300_000 })
    this.refresh.set(refresh, { sub, org, family, used: false })
    const user = this.users[sub]
    const body: Record<string, unknown> = { access_token: access, token_type: 'Bearer', expires_in: 300, refresh_token: refresh, scope: 'openid profile email offline_access pi.entitlements' }
    if (nonce !== undefined) {
      body.id_token = unsignedJwt({
        iss: ISSUER, aud: CLIENT_ID, sub, iat: Math.floor(this.now() / 1000), exp: Math.floor(this.now() / 1000) + 300, nonce,
        name: user?.display_name, email: user?.email, ...this.idTokenOverrides,
      })
    }
    return json(200, body, { 'Cache-Control': 'no-store' })
  }

  private member(sub: string, org: string) {
    return this.users[sub]?.memberships.some(m => m.org_id === org && m.status === 'active') ?? false
  }

  private auth(call: Call) {
    const token = /^Bearer (.+)$/.exec(call.headers.Authorization ?? '')?.[1]
    const access = token ? this.access.get(token) : undefined
    return access && access.exp > this.now() ? access : null
  }

  private route(call: Call): Response {
    const { path } = call
    if (path === '/.well-known/openid-configuration') {
      return json(200, {
        issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`,
        revocation_endpoint: `${ISSUER}/revoke`, end_session_endpoint: `${ISSUER}/logout`, code_challenge_methods_supported: ['S256'],
      })
    }
    if (path === '/token' && call.method === 'POST') return this.token(call.body!)
    if (path === '/revoke' && call.method === 'POST') {
      const entry = this.refresh.get(call.body!.get('token') ?? '')
      if (entry) this.revokedFamilies.add(entry.family)
      return new Response(null, { status: 200 })
    }
    const productCatalog = /^\/v1\/products\/([a-z]+)\/feature-catalog$/.exec(path)
    if (productCatalog) {
      const catalog = this.catalogs[productCatalog[1]]
      return catalog ? json(200, { catalog }, { 'Cache-Control': 'public, max-age=3600' }) : problem(503, 'dependency_unavailable')
    }
    const access = this.auth(call)
    if (!access) return problem(401, 'unauthenticated', { 'WWW-Authenticate': 'Bearer error="invalid_token"' })
    if (path === '/v1/me') {
      const user = this.users[access.sub]
      return json(200, { ...user, org_context: access.org }, { 'Cache-Control': 'no-store' })
    }
    if (path === '/v1/me/entitlements') {
      const product = call.query.get('product_id')
      if (!product) return problem(400, 'invalid_request')
      const list = (this.entitlements[`${access.sub}|${access.org ?? ''}`] ?? []).filter(e => e.product_id === product)
      return json(200, { product_id: product, org_context: access.org, entitlements: list }, { 'Cache-Control': 'no-store' })
    }
    return problem(400, 'invalid_request')
  }

  private token(body: URLSearchParams): Response {
    if (body.get('client_id') !== CLIENT_ID) return json(401, { error: 'invalid_client' })
    if (body.get('grant_type') === 'authorization_code') {
      const code = this.codes.get(body.get('code') ?? '')
      if (!code || code.used) return json(400, { error: 'invalid_grant' })
      code.used = true
      const verifier = body.get('code_verifier') ?? ''
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      if (challenge !== code.challenge || body.get('redirect_uri') !== code.redirectUri) return json(400, { error: 'invalid_grant' })
      return this.issue(code.sub, code.org, ++this.families, code.nonce)
    }
    if (body.get('grant_type') === 'refresh_token') {
      const presented = this.refresh.get(body.get('refresh_token') ?? '')
      if (!presented || this.revokedFamilies.has(presented.family)) return json(400, { error: 'invalid_grant' })
      // RFC 9700 §4.14.2: replaying a rotated token revokes the whole family.
      if (presented.used) {
        this.revokedFamilies.add(presented.family)
        return json(400, { error: 'invalid_grant' })
      }
      const requested = body.get('org_context')
      const org = requested === null ? presented.org : requested === 'personal' ? null : requested
      if (org && !this.member(presented.sub, org)) return json(400, { error: 'invalid_grant' })
      presented.used = true
      return this.issue(presented.sub, org, presented.family)
    }
    return json(400, { error: 'unsupported_grant_type' })
  }
}
