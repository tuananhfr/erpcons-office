// An in-memory PI Platform for account.js tests, written after the PI code (pi_id module of pi-platform): the
// /id/authorize page steps (PI session, prompt, org_hint, organization choice), /id/token (PKCE code grant, rotating
// refresh tokens with reuse detection, eligibility re-checked on every grant), /id/revoke, /api/v1/id/me with the
// `{ok, …}` envelope and UPPERCASE error codes, EdDSA JWTs + JWKS, and CORS only where PI's CorsSubscriber adds it.
import { createHash, generateKeyPairSync, randomBytes, randomUUID, sign, verify, type KeyObject } from 'node:crypto'

export const ISSUER = 'https://id.pi.invalid'
export const CLIENT_ID = 'erpcons-office-web'
export const SITE_ORIGIN = 'https://office.erpcons.ai'
export const REDIRECT_URI = `${SITE_ORIGIN}/dang-nhap/callback/`
export const WEB_SCOPES = 'openid profile email offline_access'
export const ME_PATH = '/api/v1/id/me'
export const AUDIENCE = 'pi-platform'
export const KID = 'test-2026-10'

// PI ids are UUIDs (account_id, org_id); `org_hint` only takes this shape.
export const AN = '0b6f9a52-3c1e-4d7a-9f20-6a8e51c4d2b7'
export const BINH = '5e2d8c41-7a90-4b3f-8e16-c4a7d9f02b58'
export const ORG_XD = '3a7c1e90-2b4d-4f68-9a15-7e0c2d4b6f81'
export const ORG_KT = '8d41b6e2-9c07-4a35-b2f8-1e6a3c5d7f90'
export const ORG_OLD = 'c6e0a2f4-1d83-4b97-8f2a-5b9d1c3e7a46'

const ACCESS_TTL = 600
const REFRESH_TTL = 30 * 86400
const CODE_TTL = 60
const SESSION_TTL = 12 * 3600
const LEEWAY = 30
const CORS_PATHS = ['/id/token', '/id/revoke', '/id/userinfo']
const CORS_PREFIX = '/api/v1/id/'
// What a cross-origin script may read of a response: the safelisted headers plus PI's Expose-Headers.
const READABLE_HEADERS = ['cache-control', 'content-language', 'content-length', 'content-type', 'expires', 'last-modified', 'pragma', 'x-correlation-id', 'idempotent-replayed']
const CORRELATION_ID = '3c9a1e52-7f04-4d6b-8a2e-1b5c9d0f7e64'

export interface Call { url: string; path: string; method: string; origin: string; headers: Record<string, string>; body: URLSearchParams | null; query: URLSearchParams }
type Hook = (call: Call) => Response | undefined

export interface Account { id: string; email: string; displayName: string; status: 'ACTIVE' | 'LOCKED'; consentMissing?: boolean }
export interface Org { id: string; name: string }
export interface Member { org: string; account: string; role: string; status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' }
export interface Client { clientId: string; name: string; product: string; redirectUris: string[]; scopes: string[]; status: 'ACTIVE' | 'DISABLED' }

export interface AuthorizeOptions {
  /** Who signs in when PI shows its login page (no PI session, or `prompt=login`). */
  as?: string
  /** The pick on PI's organization page: an org id or `personal`. PI pre-checks the first organization. */
  choose?: string
}

interface Code { client: string; account: string; org: string | null; redirectUri: string; challenge: string; scope: string; nonce: string; family: string; expires: number; createdAt: number; usedAt: number | null }
export interface RefreshRow { client: string; account: string; org: string | null; scope: string; family: string; expires: number; rotatedAt: number | null; revokedAt: number | null; revokeReason: string | null }

const b64url = (data: Buffer | string) => Buffer.from(data).toString('base64url')
const token32 = () => randomBytes(32).toString('base64url')
const appendQuery = (uri: string, params: Record<string, string>) => {
  const entries = Object.entries(params).filter(([, value]) => value !== '')
  return uri + (uri.includes('?') ? '&' : '?') + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

export const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Correlation-Id': CORRELATION_ID, ...headers } })
/** PI's API error envelope (pi_api ApiResponse::error): `{ok:false, message, code?}`, codes in UPPERCASE. */
export const piError = (status: number, message: string, code?: string, headers: Record<string, string> = {}) =>
  json(status, code === undefined ? { ok: false, message } : { ok: false, message, code }, headers)

export class FakePi {
  calls: Call[] = []
  offline = false
  hooks: { hook: Hook; once: boolean }[] = []
  /** PI pages the user saw in the popup, in order: `login`, `consent`, `org`. */
  pages: string[] = []
  idTokenOverrides: Record<string, unknown> = {}
  /** Path prefixes given CORS on top of PI's own, for endpoints a test stands in for. */
  extraCorsPrefixes: string[] = []
  clients: Record<string, Client> = {
    [CLIENT_ID]: { clientId: CLIENT_ID, name: 'ERPCons Office', product: '', redirectUris: [REDIRECT_URI], scopes: WEB_SCOPES.split(' '), status: 'ACTIVE' },
  }
  accounts: Record<string, Account> = {
    [AN]: { id: AN, email: 'an.nguyen@example.com', displayName: 'Nguyễn Văn An', status: 'ACTIVE' },
    [BINH]: { id: BINH, email: '', displayName: 'Trần Thị Bình', status: 'ACTIVE' },
  }
  orgs: Record<string, Org> = {
    [ORG_XD]: { id: ORG_XD, name: 'Công ty Xây dựng Ví dụ' },
    [ORG_KT]: { id: ORG_KT, name: 'Kiến trúc Mẫu' },
    [ORG_OLD]: { id: ORG_OLD, name: 'Văn phòng Cũ' },
  }
  members: Member[] = [
    { org: ORG_XD, account: AN, role: 'member', status: 'ACTIVE' },
    { org: ORG_OLD, account: AN, role: 'member', status: 'SUSPENDED' },
  ]
  /** The PIID_S cookie of the one browser the tests drive. */
  session: { account: string; expires: number } | null = null
  readonly publicKey: KeyObject
  private readonly privateKey: KeyObject
  private codes = new Map<string, Code>()
  private refresh = new Map<string, RefreshRow>()
  private now: () => number
  constructor(now: () => number) {
    this.now = now
    const pair = generateKeyPairSync('ed25519')
    this.publicKey = pair.publicKey
    this.privateKey = pair.privateKey
  }

  private seconds() { return Math.floor(this.now() / 1000) }

  /** Plays the PI ID page behind /id/authorize (OidcController::authorize + afterLogin) and returns where it redirects. */
  authorize(authorizeUrl: string, options: AuthorizeOptions = {}): string {
    const url = new URL(authorizeUrl)
    if (url.origin + url.pathname !== `${ISSUER}/id/authorize`) throw new Error(`unexpected authorize endpoint ${url}`)
    const get = (key: string) => (url.searchParams.get(key) ?? '').trim()
    const client = this.activeClient(get('client_id'))
    if (!client) throw new Error('PI error page: invalid_client (no redirect)')
    const redirect = get('redirect_uri')
    if (!client.redirectUris.includes(redirect)) throw new Error('PI error page: redirect_uri not registered (no redirect)')
    const state = get('state').slice(0, 500)
    const fail = (error: string, description: string) => appendQuery(redirect, { error, error_description: description, state, iss: ISSUER })
    if (get('response_type') !== 'code') return fail('unsupported_response_type', 'Chỉ hỗ trợ response_type=code.')
    const challenge = get('code_challenge')
    if (get('code_challenge_method') !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return fail('invalid_request', 'Bắt buộc PKCE với code_challenge_method=S256.')
    const scopes = this.grantScopes(client, get('scope'))
    if (!scopes) return fail('invalid_scope', 'Phạm vi không hợp lệ hoặc vượt quyền của ứng dụng (bắt buộc có openid).')
    const prompt = get('prompt')
    if (!['', 'login', 'none', 'select_account'].includes(prompt)) return fail('invalid_request', 'prompt không hợp lệ.')
    const hint = /^[0-9a-f-]{36}$/.test(get('org_hint')) ? get('org_hint') : ''

    let account = prompt === 'login' ? null : this.sessionAccount()
    if (!account && prompt === 'none') return appendQuery(redirect, { error: 'login_required', state, iss: ISSUER })
    if (!account) {
      this.pages.push('login')
      account = this.accounts[options.as ?? AN] ?? null
      if (!account) throw new Error(`no PI account ${options.as}`)
      if (account.status !== 'ACTIVE') throw new Error('PI page: account locked (no redirect)')
      this.session = { account: account.id, expires: this.seconds() + SESSION_TTL }
    }
    if (account.consentMissing) {
      this.pages.push('consent')
      account.consentMissing = false
    }
    const orgs = this.activeOrgs(account.id)
    let org: string | null
    if (hint && orgs.some(o => o.id === hint)) {
      org = hint
    } else if (orgs.length >= 2 || (orgs.length > 0 && prompt === 'select_account')) {
      this.pages.push('org')
      const choice = options.choose ?? orgs[0].id
      if (choice !== 'personal' && !orgs.some(o => o.id === choice)) throw new Error(`org ${choice} is not on the PI page`)
      org = choice === 'personal' ? null : choice
    } else {
      org = orgs.length ? orgs[0].id : null
    }
    const code = token32()
    this.codes.set(code, {
      client: client.clientId, account: account.id, org, redirectUri: redirect, challenge, scope: scopes.join(' '),
      nonce: get('nonce').slice(0, 255), family: randomUUID(), expires: this.seconds() + CODE_TTL, createdAt: this.seconds(), usedAt: null,
    })
    return appendQuery(redirect, { code, state, iss: ISSUER })
  }

  /** A refresh token as if the user had signed in earlier. */
  seedRefreshToken(account = AN, org: string | null = null): string {
    const token = token32()
    this.refresh.set(token, { client: CLIENT_ID, account, org, scope: WEB_SCOPES, family: randomUUID(), expires: this.seconds() + REFRESH_TTL, rotatedAt: null, revokedAt: null, revokeReason: null })
    return token
  }
  refreshState(token: string): RefreshRow | undefined { return this.refresh.get(token) }
  revokeAll() { for (const row of this.refresh.values()) row.revokedAt ??= this.seconds() }
  setMembership(account: string, org: string, status: Member['status'] | null, role = 'member') {
    this.members = this.members.filter(m => !(m.account === account && m.org === org))
    if (status) this.members.push({ org, account, role, status })
  }

  /** Verifies one of this platform's JWTs the way PI's Jwt::verify does; null when invalid. */
  verifyJwt(token: string, typ = 'JWT'): Record<string, unknown> | null {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    if (header.alg !== 'EdDSA' || header.kid !== KID || (header.typ ?? 'JWT') !== typ) return null
    if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), this.publicKey, Buffer.from(parts[2], 'base64url'))) return null
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    if (typeof claims.exp !== 'number' || claims.exp + LEEWAY < this.seconds()) return null
    if (typeof claims.nbf === 'number' && claims.nbf - LEEWAY > this.seconds()) return null
    return claims
  }

  on(hook: Hook, once = true) { this.hooks.push({ hook, once }) }
  count(predicate: (call: Call) => boolean) { return this.calls.filter(predicate).length }
  grants(type: string) { return this.calls.filter(c => c.path === '/id/token' && c.body?.get('grant_type') === type) }

  /** A browser fetch from `origin`: without a matching CORS answer the page sees only a network error. */
  fetch = async (input: string, init: { method?: string; headers?: Record<string, string>; body?: string; credentials?: string } = {}, origin = SITE_ORIGIN): Promise<Response> => {
    const url = new URL(input)
    const call: Call = {
      url: input, path: url.pathname, method: init.method ?? 'GET', origin, headers: { ...init.headers },
      body: init.body ? new URLSearchParams(init.body) : null, query: url.searchParams,
    }
    this.calls.push(call)
    if (init.credentials !== 'omit') throw new Error('PI requests must not send cookies')
    if (this.offline || url.origin !== ISSUER) throw new TypeError('Failed to fetch')
    const cors = this.corsAllows(call)
    // A non-simple request (Bearer header) is preflighted; PI answers no preflight outside its CORS paths.
    if (!cors && Object.keys(call.headers).some(name => /^authorization$/i.test(name))) throw new TypeError('Failed to fetch')
    let response: Response | undefined
    for (const entry of [...this.hooks]) {
      response = entry.hook(call)
      if (response) {
        if (entry.once) this.hooks = this.hooks.filter(h => h !== entry)
        break
      }
    }
    response ??= this.route(call)
    // Simple requests reach the server either way; the browser just withholds the answer.
    if (!cors) throw new TypeError('Failed to fetch')
    const headers = new Headers()
    response.headers.forEach((value, name) => { if (READABLE_HEADERS.includes(name.toLowerCase())) headers.set(name, value) })
    return new Response(response.body, { status: response.status, headers })
  }

  private corsAllows(call: Call): boolean {
    const path = call.path
    const covered = CORS_PATHS.includes(path) || path.startsWith(CORS_PREFIX) || this.extraCorsPrefixes.some(prefix => path.startsWith(prefix))
    const origins = Object.values(this.clients).filter(c => c.status === 'ACTIVE').flatMap(c => c.redirectUris.map(uri => new URL(uri).origin))
    return covered && origins.includes(call.origin)
  }

  private activeClient(id: string): Client | null {
    const client = /^[a-z0-9][a-z0-9-]{2,63}$/.test(id) ? this.clients[id] : undefined
    return client && client.status === 'ACTIVE' ? client : null
  }

  private grantScopes(client: Client, requested: string): string[] | null {
    const asked = [...new Set(requested.trim().split(/\s+/).filter(Boolean))]
    if (!asked.includes('openid')) return null
    return asked.every(scope => client.scopes.includes(scope)) ? asked : null
  }

  private sessionAccount(): Account | null {
    const session = this.session
    const account = session && session.expires >= this.seconds() ? this.accounts[session.account] : undefined
    return account && account.status === 'ACTIVE' ? account : null
  }

  private activeOrgs(account: string): Org[] {
    return this.members.filter(m => m.account === account && m.status === 'ACTIVE').map(m => this.orgs[m.org]).sort((a, b) => a.name.localeCompare(b.name))
  }

  private signJwt(claims: Record<string, unknown>, typ = 'JWT'): string {
    const input = `${b64url(JSON.stringify({ alg: 'EdDSA', typ, kid: KID }))}.${b64url(JSON.stringify(claims))}`
    return `${input}.${b64url(sign(null, Buffer.from(input), this.privateKey))}`
  }

  private route(call: Call): Response {
    const { path, method } = call
    if (path === '/.well-known/openid-configuration' && method === 'GET') {
      return json(200, {
        issuer: ISSUER, authorization_endpoint: `${ISSUER}/id/authorize`, token_endpoint: `${ISSUER}/id/token`,
        userinfo_endpoint: `${ISSUER}/id/userinfo`, revocation_endpoint: `${ISSUER}/id/revoke`, end_session_endpoint: `${ISSUER}/id/logout`,
        jwks_uri: `${ISSUER}/id/jwks.json`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
        id_token_signing_alg_values_supported: ['EdDSA'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'],
        authorization_response_iss_parameter_supported: true,
      }, { 'Cache-Control': 'public, max-age=300' })
    }
    if (path === '/id/jwks.json' && method === 'GET') {
      const jwk = this.publicKey.export({ format: 'jwk' })
      return json(200, { keys: [{ kty: 'OKP', crv: 'Ed25519', x: jwk.x, kid: KID, use: 'sig', alg: 'EdDSA' }] }, { 'Cache-Control': 'public, max-age=300' })
    }
    if (path === '/id/token' && method === 'POST') {
      if (!(call.headers['Content-Type'] ?? '').startsWith('application/x-www-form-urlencoded')) {
        return json(400, { error: 'invalid_request', error_description: 'Content-Type phải là application/x-www-form-urlencoded.' }, { 'Cache-Control': 'no-store' })
      }
      const [status, body] = this.token(call.body ?? new URLSearchParams())
      return json(status, body, { 'Cache-Control': 'no-store', Pragma: 'no-cache' })
    }
    if (path === '/id/revoke' && method === 'POST') {
      const row = this.refresh.get(call.body?.get('token') ?? '')
      if (row && row.client === (call.body?.get('client_id') ?? '')) this.revokeFamily(row.family, 'revoked_by_client')
      return json(200, {}, { 'Cache-Control': 'no-store' })
    }
    if (path.startsWith('/api/')) return this.api(call)
    return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } })
  }

  // BearerAccessCheck, then IdApiController.
  private api(call: Call): Response {
    const routes: Record<string, string> = { [ME_PATH]: 'openid', [`${ME_PATH}/entitlements`]: 'openid' }
    const scope = routes[call.path]
    if (!scope || call.method !== 'GET') return piError(404, 'Không tìm thấy tài nguyên.')
    const header = call.headers.Authorization ?? ''
    const claims = header.startsWith('Bearer ') ? this.verifyJwt(header.slice(7).trim()) : null
    const audience = claims ? ([] as unknown[]).concat(claims.aud ?? []) : []
    const account = claims && audience.includes(AUDIENCE) && typeof claims.sub === 'string' ? this.accounts[claims.sub] : undefined
    if (!claims || !account) return piError(401, 'Bạn chưa đăng nhập hoặc phiên đã hết hạn.')
    if (account.status !== 'ACTIVE') return piError(403, 'Tài khoản PI ID đã bị khoá.', 'ACCOUNT_LOCKED')
    const scopes = String(claims.scope ?? '').split(' ')
    if (!scopes.includes(scope)) return piError(403, `Access token không có phạm vi ${scope}.`, 'INSUFFICIENT_SCOPE')
    const org = typeof claims.org_context === 'string' ? claims.org_context : null
    if (org && !this.members.some(m => m.org === org && m.account === account.id && m.status === 'ACTIVE')) {
      return piError(403, 'Bạn không còn là thành viên hoạt động của tổ chức trong token.', 'MEMBERSHIP_INACTIVE')
    }
    if (call.path.endsWith('/entitlements')) return json(200, { ok: true, items: [] })
    const organizations = this.members
      .filter(m => m.account === account.id && (m.status === 'ACTIVE' || m.status === 'SUSPENDED'))
      .map(m => ({ id: m.org, name: this.orgs[m.org].name, type: 'COMPANY', memberCount: 1, myRole: m.role, myStatus: m.status }))
      .sort((a, b) => a.name.localeCompare(b.name))
    return json(200, {
      ok: true,
      user: { id: account.id, email: account.email, displayName: account.displayName, country: 'VN', profession: '', status: account.status, lockReason: '', hasPassword: false },
      organizations,
      orgContext: org,
      scopes,
      meta: { roles: [] },
    })
  }

  private token(form: URLSearchParams): [number, Record<string, unknown>] {
    const get = (key: string) => (form.get(key) ?? '').trim()
    const client = this.activeClient(get('client_id'))
    if (!client) return [401, { error: 'invalid_client', error_description: 'Ứng dụng không hợp lệ.' }]
    if (get('grant_type') === 'authorization_code') return this.exchangeCode(client, get('code'), get('redirect_uri'), get('code_verifier'))
    if (get('grant_type') === 'refresh_token') return this.refreshGrant(client, get('refresh_token'), get('scope'))
    return [400, { error: 'unsupported_grant_type', error_description: 'Chỉ hỗ trợ authorization_code và refresh_token.' }]
  }

  private exchangeCode(client: Client, value: string, redirect: string, verifier: string): [number, Record<string, unknown>] {
    const invalid: [number, Record<string, unknown>] = [400, { error: 'invalid_grant', error_description: 'Mã uỷ quyền không hợp lệ hoặc đã hết hạn.' }]
    if (value === '') return invalid
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return [400, { error: 'invalid_request', error_description: 'code_verifier không hợp lệ.' }]
    const code = this.codes.get(value)
    if (!code) return invalid
    if (code.usedAt !== null) {
      this.revokeFamily(code.family, 'code_reuse')
      return invalid
    }
    if (code.expires < this.seconds() || code.client !== client.clientId || code.redirectUri !== redirect) return invalid
    if (createHash('sha256').update(verifier).digest('base64url') !== code.challenge) return [400, { error: 'invalid_grant', error_description: 'PKCE không khớp.' }]
    code.usedAt = this.seconds()
    const problem = this.eligibility(code.account, code.org)
    if (problem) return [400, { error: 'invalid_grant', error_description: problem }]
    const scopes = code.scope.split(' ')
    const body = this.tokens(client, code.account, scopes, code.org, code.family)
    const account = this.accounts[code.account]
    const profile: Record<string, unknown> = {}
    if (scopes.includes('profile')) Object.assign(profile, { name: account.displayName, locale: 'vi-VN', country: 'VN' })
    if (scopes.includes('email')) Object.assign(profile, { email: account.email, email_verified: true })
    // PI's ID token drops empty claims and carries no org_context.
    const claims = Object.fromEntries(Object.entries({
      iss: ISSUER, sub: account.id, aud: client.clientId, iat: this.seconds(), exp: this.seconds() + ACCESS_TTL, auth_time: code.createdAt,
      nonce: code.nonce, amr: ['otp'], ...profile,
    }).filter(([, v]) => v !== '' && v !== null))
    body.id_token = this.signJwt({ ...claims, ...this.idTokenOverrides })
    return [200, body]
  }

  private refreshGrant(client: Client, value: string, scope: string): [number, Record<string, unknown>] {
    const invalid: [number, Record<string, unknown>] = [400, { error: 'invalid_grant', error_description: 'Refresh token không hợp lệ hoặc đã bị thu hồi.' }]
    const row = value ? this.refresh.get(value) : undefined
    if (!row || row.revokedAt !== null || row.client !== client.clientId) return invalid
    if (row.rotatedAt !== null) {
      // A rotated token presented again: someone holds a copy, so the whole family goes.
      this.revokeFamily(row.family, 'refresh_reuse')
      return invalid
    }
    if (row.expires < this.seconds()) return invalid
    const granted = row.scope.split(' ')
    let scopes = granted
    if (scope !== '') {
      const asked = [...new Set(scope.split(/\s+/).filter(Boolean))]
      if (asked.some(s => !granted.includes(s))) return [400, { error: 'invalid_scope', error_description: 'Không được xin rộng hơn phạm vi đã cấp.' }]
      scopes = asked
    }
    row.rotatedAt = this.seconds()
    const problem = this.eligibility(row.account, row.org)
    if (problem) {
      this.revokeFamily(row.family, 'not_eligible')
      return [400, { error: 'invalid_grant', error_description: problem }]
    }
    // The context is the family's: any `org_context` in the form is ignored, as PI does.
    return [200, this.tokens(client, row.account, scopes, row.org, row.family)]
  }

  private eligibility(accountId: string, org: string | null): string | null {
    const account = this.accounts[accountId]
    if (!account || account.status !== 'ACTIVE') return 'Tài khoản đã bị khoá.'
    if (account.consentMissing) return 'CONSENT_REQUIRED: cần đồng ý lại điều khoản / quyền riêng tư.'
    if (org && !this.members.some(m => m.org === org && m.account === accountId && m.status === 'ACTIVE')) return 'Bạn không còn là thành viên hoạt động của tổ chức này.'
    return null
  }

  private tokens(client: Client, account: string, scopes: string[], org: string | null, family: string): Record<string, unknown> {
    const now = this.seconds()
    const claims = {
      iss: ISSUER, sub: account, aud: [AUDIENCE, client.product].filter(Boolean), azp: client.clientId, scope: scopes.join(' '),
      org_context: org, iat: now, nbf: now, exp: now + ACCESS_TTL, jti: randomUUID(),
    }
    const body: Record<string, unknown> = { access_token: this.signJwt(claims), token_type: 'Bearer', expires_in: ACCESS_TTL, scope: scopes.join(' ') }
    if (scopes.includes('offline_access')) {
      const refresh = token32()
      this.refresh.set(refresh, { client: client.clientId, account, org, scope: scopes.join(' '), family, expires: now + REFRESH_TTL, rotatedAt: null, revokedAt: null, revokeReason: null })
      body.refresh_token = refresh
    }
    return body
  }

  private revokeFamily(family: string, reason: string) {
    for (const row of this.refresh.values()) {
      if (row.family === family && row.revokedAt === null) {
        row.revokedAt = this.seconds()
        row.revokeReason = reason
      }
    }
  }
}
