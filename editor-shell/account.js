(function () {
  // Contract: erpcons-account/docs/contract.openapi.yaml (OIDC, errors), products.md §4 (allowed), ADR 0002/0006,
  // bridged to what the real PI Platform (pi_id module) serves.
  var API_VERSION = 1
  var PRODUCT_BY_PATH = { 'van-ban': 'vanban', 'bang-tinh': 'bangtinh', 'trinh-chieu': 'trinhchieu', pdf: 'pdf' }
  var PRODUCTS = ['vanban', 'bangtinh', 'trinhchieu', 'pdf']
  var FEATURE_ID = /^(vanban|bangtinh|trinhchieu|pdf)\.[a-z0-9_]+(\.[a-z0-9_]+)*$/
  var OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
  // PI ignores an `org_hint` of any other shape (AuthorizationServer::validateAuthorize).
  var ORG_HINT = /^[0-9a-f-]{36}$/
  var PINNED_FREE = /\.(view|export)$/
  var SESSION_KEY = 'erpcons-pi-session'
  var PROFILE_KEY = 'erpcons-pi-profile'
  var CATALOG_KEY = 'erpcons-pi-catalog:'
  var PENDING_KEY = 'erpcons-pi-pending'
  var SIGNED_OUT_KEY = 'erpcons-pi-signed-out'
  var LANGUAGE_KEY = 'erpcons-ui-language'
  var CHANNEL = 'erpcons-pi'
  var LOCK = 'erpcons-pi-refresh'
  var POPUP_NAME = 'erpcons-pi-sign-in'
  var ENTITLEMENTS_TTL = 10 * 60 * 1000
  var CATALOG_INTERVAL = 24 * 3600 * 1000
  var PENDING_TTL = 10 * 60 * 1000
  var ACCESS_MARGIN = 30 * 1000
  var SKEW = 300 * 1000
  var PEER_WAIT = 1500
  var POPUP_POLL = 500
  var BACKOFF_MAX = 5 * 60 * 1000
  var MESSAGES = {
    popup_blocked: 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên cho trang này rồi thử lại.',
    storage: 'Trình duyệt đang chặn bộ nhớ của trang nên không giữ được phiên đăng nhập.',
    state_mismatch: 'Phiên đăng nhập không hợp lệ hoặc đã quá hạn. Hãy đăng nhập lại.',
    nonce_mismatch: 'Phản hồi đăng nhập không hợp lệ. Hãy đăng nhập lại.',
    invalid_id_token: 'Phản hồi đăng nhập không hợp lệ. Hãy đăng nhập lại.',
    issuer_mismatch: 'Phản hồi đăng nhập không hợp lệ. Hãy đăng nhập lại.',
    session_expired: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
    insufficient_scope: 'Cần đăng nhập lại để cấp đủ quyền cho Văn phòng.',
    user_suspended: 'Tài khoản PI ID đang bị tạm khóa. Bạn vẫn dùng được mọi tính năng miễn phí.',
    membership_inactive: 'Bạn không còn là thành viên của tổ chức này. Hãy đăng nhập lại.',
    unknown_org: 'Không tìm thấy tổ chức này trong tài khoản của bạn.',
    forbidden: 'Tài khoản chưa được dùng tính năng trả phí. Các tính năng miễn phí vẫn dùng bình thường.',
    quota_exceeded: 'Đã dùng hết hạn mức của gói hiện tại.',
    rate_limited: 'PI ID đang bận. Hãy thử lại sau ít phút.',
    dependency_unavailable: 'PI ID tạm thời không phản hồi. Hãy thử lại sau.',
    network: 'Không kết nối được PI ID. Kiểm tra mạng rồi thử lại.',
    discovery_failed: 'Không kết nối được PI ID. Kiểm tra mạng rồi thử lại.',
    sign_in_failed: 'Không đăng nhập được. Hãy thử lại.'
  }
  var SIGNED_IN_TEXT = 'Đã đăng nhập. Bạn có thể đóng cửa sổ này.'

  var BUILTIN = {}
  PRODUCTS.forEach(function (product) {
    ['view', 'export', 'use'].forEach(function (name) { BUILTIN[product + '.' + name] = 'free' })
  })

  var config = window.erpPi
  var search = new URLSearchParams(location.search)
  // Inside the ERP iframe storage is partitioned and the host page owns identity: no sign-in, no PI calls.
  var embedded = search.get('host') === 'parent' || search.get('embed') === 'erpcons'
  var enabled = Boolean(config && config.version === 1 && typeof config.issuer === 'string') && !embedded
  var product = PRODUCT_BY_PATH[location.pathname.split('/')[1]] || null
  var local = enabled ? storage('localStorage') : null
  var channel = null
  if (enabled) {
    try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL) : null } catch (e) { channel = null }
  }

  function noop() {}
  function hasOwn(object, key) { return Object.prototype.hasOwnProperty.call(object, key) }
  function now() { return Date.now() }
  function mono() { return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now() }
  function storage(name) {
    try {
      var store = window[name]
      store.getItem(SESSION_KEY)
      return store
    } catch (e) { return null }
  }
  function readJson(store, key) {
    if (!store) return null
    try {
      var raw = store.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch (e) { return null }
  }
  function writeJson(store, key, value) {
    if (!store) return false
    try {
      store.setItem(key, JSON.stringify(value))
      return true
    } catch (e) { return false }
  }
  function removeKey(store, key) {
    if (!store) return
    try { store.removeItem(key) } catch (e) { /* Nothing to clear when storage is blocked. */ }
  }
  function query(fields) {
    return Object.keys(fields).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(fields[key]) }).join('&')
  }
  function base64url(bytes) {
    var text = ''
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i])
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  function fromBase64url(text) {
    var padded = text.replace(/-/g, '+').replace(/_/g, '/')
    while (padded.length % 4) padded += '='
    var binary = atob(padded)
    var bytes = new Uint8Array(binary.length)
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }
  function utf8(text) { return new TextEncoder().encode(text) }
  function decodeSegment(segment) { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(fromBase64url(segment))) }
  function randomToken(size) {
    var bytes = new Uint8Array(size)
    crypto.getRandomValues(bytes)
    return base64url(bytes)
  }
  function pkceChallenge(verifier) {
    return crypto.subtle.digest('SHA-256', utf8(verifier)).then(function (hash) { return base64url(new Uint8Array(hash)) })
  }
  function failure(code, status, retryAfter) {
    var error = new Error(code)
    error.code = code
    error.status = status || 0
    error.retryAfter = typeof retryAfter === 'number' ? retryAfter : null
    return error
  }
  function errorInfo(code, retryAfter) {
    return code ? { code: code, message: MESSAGES[code] || MESSAGES.sign_in_failed, retryAfter: typeof retryAfter === 'number' ? retryAfter : null } : null
  }
  function announce(message) {
    if (!channel) return
    try { channel.postMessage(message) } catch (e) { /* Other tabs still see the storage event. */ }
  }
  function redirectUri() { return location.origin + config.callbackPath }

  // --- HTTP -----------------------------------------------------------------------------------------------

  function send(url, init) {
    init.credentials = 'omit'
    init.cache = 'no-store'
    return fetch(url, init).then(null, function () { throw failure('network') })
  }
  function readBody(response) {
    return response.text().then(function (text) {
      try { return text ? JSON.parse(text) : null } catch (e) { return null }
    }, function () { return null })
  }
  function retryAfterOf(response) {
    var value = response.headers && response.headers.get('Retry-After')
    if (value === null || value === undefined || !/^\d+$/.test(String(value).trim())) return null
    return parseInt(value, 10)
  }
  // PI's API envelope is `{ok:false, message, code?}` with UPPERCASE codes; any other code falls back to the status.
  var PI_CODES = {
    403: { ACCOUNT_LOCKED: 'user_suspended', MEMBERSHIP_INACTIVE: 'membership_inactive', INSUFFICIENT_SCOPE: 'insufficient_scope' }
  }
  function problemCode(status, body) {
    var code = body && typeof body.code === 'string' ? body.code : null
    if (code && PI_CODES[status] && hasOwn(PI_CODES[status], code)) return PI_CODES[status][code]
    if (status === 401) return 'unauthenticated'
    if (status === 403) return 'forbidden'
    if (status === 429) return 'rate_limited'
    if (status >= 500) return 'dependency_unavailable'
    return 'invalid_request'
  }
  function api(url, token) {
    var headers = { Accept: 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    return send(url, { method: 'GET', headers: headers }).then(function (response) {
      return readBody(response).then(function (body) {
        if (response.ok) return body
        var code = problemCode(response.status, body)
        console.warn('PI request failed', url, response.status, code, response.headers && response.headers.get('X-Correlation-Id'))
        throw failure(code, response.status, retryAfterOf(response))
      })
    })
  }
  function apiPath(path) { return config.apiBase.replace(/\/$/, '') + path }

  // PI serves its discovery document without CORS, so the endpoints come from the site config (src/config/pi.ts).
  function endpoint(name) {
    var url = config[name]
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) throw failure('discovery_failed')
    return url
  }

  function tokenRequest(fields) {
    return Promise.resolve().then(function () {
      return send(endpoint('tokenEndpoint'), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: query(fields) })
    }).then(function (response) {
      return readBody(response).then(function (body) {
        if (response.ok) {
          if (!body || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || !/^bearer$/i.test(String(body.token_type))) {
            throw failure('sign_in_failed', response.status)
          }
          return body
        }
        if (body && body.error === 'invalid_grant') throw failure('invalid_grant', response.status)
        if (response.status === 429) throw failure('rate_limited', 429, retryAfterOf(response))
        if (response.status >= 500) throw failure('dependency_unavailable', response.status, retryAfterOf(response))
        throw failure('sign_in_failed', response.status)
      })
    })
  }
  function expiresAt(body) {
    var seconds = typeof body.expires_in === 'number' && body.expires_in > 0 ? body.expires_in : 300
    return now() + seconds * 1000
  }

  // --- Stored session -------------------------------------------------------------------------------------
  // Only sign-in and rotation (both inside the lock) write SESSION_KEY: writing a stale copy back would replay an
  // old refresh token and revoke the whole family. Display data lives apart in PROFILE_KEY.

  function readSession() {
    var session = readJson(local, SESSION_KEY)
    return session && session.v === 1 && typeof session.refresh_token === 'string' && typeof session.sub === 'string' && typeof session.gen === 'string' ? session : null
  }
  function identityOf(session) { return session ? session.sub + '|' + (session.org_context || '') : null }
  function readProfile(session) {
    var profile = readJson(local, PROFILE_KEY)
    return profile && profile.v === 1 && session && profile.sub === session.sub ? profile : null
  }
  function withLock(work) {
    var locks = typeof navigator !== 'undefined' && navigator.locks
    if (locks && typeof locks.request === 'function') return locks.request(LOCK, function () { return work() })
    // Without Web Locks only this tab is serialized; every supported browser has them.
    var run = lockChain.then(work, work)
    lockChain = run.then(noop, noop)
    return run
  }
  var lockChain = Promise.resolve()

  function idTokenClaims(idToken, nonce) {
    var claims
    try {
      var parts = String(idToken).split('.')
      if (parts.length !== 3) throw new Error('shape')
      claims = decodeSegment(parts[1])
    } catch (e) { throw failure('invalid_id_token') }
    var audience = claims && claims.aud
    var forUs = audience === config.clientId || (Array.isArray(audience) && audience.indexOf(config.clientId) !== -1)
    if (!claims || claims.iss !== config.issuer || !forUs || typeof claims.sub !== 'string' || !OPAQUE_ID.test(claims.sub)) throw failure('invalid_id_token')
    if (typeof claims.exp !== 'number' || claims.exp * 1000 + SKEW < now()) throw failure('invalid_id_token')
    if (claims.nonce !== nonce) throw failure('nonce_mismatch')
    return claims
  }

  // --- Sign-in popup pages (/dang-nhap/ and /dang-nhap/callback/) -----------------------------------------

  function pageElement(name) { return document.querySelector('[data-erp-sign-in-' + name + ']') }
  function pageMessage(text, isError) {
    var status = pageElement('status')
    var box = pageElement('error')
    if (isError && box) {
      if (status) status.hidden = true
      pageElement('message').textContent = text
      box.hidden = false
      var close = pageElement('close')
      if (close) close.focus()
    } else if (status) {
      status.textContent = text
    }
  }
  function closePage() {
    try { window.close() } catch (e) { /* Not opened by script. */ }
    // Still open (reached directly, or the browser refused): go home instead of leaving a dead page.
    setTimeout(function () { location.replace('/') }, 300)
  }
  function wireClose() {
    var close = pageElement('close')
    if (close) close.addEventListener('click', closePage)
  }

  // The opener passes PI's own parameters: `org_hint` picks an organization, `prompt=select_account` shows PI's
  // organization page (the only way to pick personal), `prompt=login` asks for credentials after a sign-out.
  function startPage() {
    wireClose()
    var hint = search.get('org_hint')
    var prompt = search.get('prompt')
    var locale = search.get('ui_locales') === 'en' ? 'en' : 'vi'
    var verifier = randomToken(32)
    var state = randomToken(16)
    var nonce = randomToken(16)
    pkceChallenge(verifier).then(function (challenge) {
      var authorize = endpoint('authorizationEndpoint')
      // The popup keeps the verifier and state to itself (ADR 0002); the callback runs in the same window.
      var pending = { v: 1, state: state, nonce: nonce, verifier: verifier, created_at: now() }
      if (!writeJson(storage('sessionStorage'), PENDING_KEY, pending)) throw failure('storage')
      var fields = {
        response_type: 'code', client_id: config.clientId, redirect_uri: redirectUri(), scope: config.scopes,
        state: state, nonce: nonce, code_challenge: challenge, code_challenge_method: 'S256', ui_locales: locale
      }
      if (hint && ORG_HINT.test(hint)) fields.org_hint = hint
      if (prompt === 'login' || prompt === 'select_account') fields.prompt = prompt
      location.replace(authorize + (authorize.indexOf('?') === -1 ? '?' : '&') + query(fields))
    }).then(null, function (error) {
      announce({ type: 'sign-in-failed', error: error.code || 'sign_in_failed' })
      pageMessage(errorInfo(error.code || 'sign_in_failed').message, true)
    })
  }

  function callbackPage() {
    wireClose()
    var code = search.get('code')
    var state = search.get('state')
    var denied = search.get('error')
    // The code is single use, but it must not linger in history, the referrer or a cache.
    try { history.replaceState(null, '', location.pathname) } catch (e) { /* Keep going; the code is spent below. */ }
    var session = storage('sessionStorage')
    var pending = readJson(session, PENDING_KEY)
    removeKey(session, PENDING_KEY)
    function fail(reason) {
      announce({ type: 'sign-in-failed', error: reason })
      pageMessage(errorInfo(reason).message, true)
    }
    if (!pending || pending.v !== 1 || !state || pending.state !== state || now() - pending.created_at > PENDING_TTL) return fail('state_mismatch')
    // RFC 9207: PI names itself in the redirect; another issuer means a mixed-up response.
    var iss = search.get('iss')
    if (iss !== null && iss !== config.issuer) return fail('issuer_mismatch')
    if (denied) {
      announce({ type: 'sign-in-failed', error: denied === 'access_denied' ? 'cancelled' : 'sign_in_failed' })
      if (denied === 'access_denied') return closePage()
      return pageMessage(MESSAGES.sign_in_failed, true)
    }
    if (!code) return fail('sign_in_failed')
    var issued = null
    tokenRequest({ grant_type: 'authorization_code', code: code, redirect_uri: redirectUri(), client_id: config.clientId, code_verifier: pending.verifier })
      .then(function (body) {
        issued = body
        var claims = idTokenClaims(body.id_token, pending.nonce)
        if (!local) throw failure('storage')
        // PI's ID token has no org_context and PI may pick an organization itself: /me tells which one it chose.
        return api(endpoint('meEndpoint'), body.access_token).then(function (raw) {
          var me = meFromPi(raw)
          if (!me || me.user_id !== claims.sub) throw failure('invalid_response')
          return withLock(function () {
            var previous = readSession()
            var gen = randomToken(9)
            var session = { v: 1, refresh_token: body.refresh_token, gen: gen, sub: me.user_id, org_context: me.org_context, login: randomToken(9) }
            if (!writeJson(local, SESSION_KEY, session)) throw failure('storage')
            writeJson(local, PROFILE_KEY, profileOf(me))
            removeKey(local, SIGNED_OUT_KEY)
            issued = null
            // The access token travels to the other tabs in memory only, never through storage.
            announce({ type: 'tokens', gen: gen, access_token: body.access_token, expires_at: expiresAt(body) })
            return previous
          })
        })
      })
      .then(function (previous) {
        // An organization switch replaces a live session: its token family would otherwise stay valid for 30 days.
        return previous ? revoke(previous.refresh_token) : null
      })
      .then(function () {
        pageMessage(SIGNED_IN_TEXT, false)
        closePage()
      }, function (error) {
        // Tokens PI issued but no session kept: their family must not outlive this failed sign-in.
        if (issued) revoke(issued.refresh_token)
        fail(error.code === 'invalid_grant' ? 'session_expired' : error.code || 'sign_in_failed')
      })
  }

  // --- Tabs: tokens, identity, entitlements -----------------------------------------------------------------

  var state = { access: null, offered: null, entitlements: null, staleTimer: null, catalog: null, provisional: null, error: null, blocked: {} }
  var known = enabled ? identityOf(readSession()) : null
  var listeners = []
  var cached = null
  var pendingSignIn = null
  var refreshing = null
  var accessWaiters = []
  var inflight = {}
  var backoff = {}

  function accessValid() {
    var access = state.access
    return Boolean(access && access.identity === identityOf(readSession()) && access.expiresAt - ACCESS_MARGIN > now())
  }
  function adopt(gen, token, expires) {
    if (typeof token !== 'string') return false
    var session = readSession()
    if (!session || session.gen !== gen) {
      // Chrome can deliver the broadcast before this process sees the storage write; retried on the storage event.
      state.offered = { gen: gen, token: token, expires: expires }
      return false
    }
    state.offered = null
    state.access = { token: token, expiresAt: expires, identity: identityOf(session) }
    accessWaiters = accessWaiters.filter(function (waiter) {
      if (waiter.gen !== gen) return true
      clearTimeout(waiter.timer)
      waiter.resolve(token)
      return false
    })
    return true
  }
  function takeOffered() {
    var offer = state.offered
    if (offer) adopt(offer.gen, offer.token, offer.expires)
  }
  function waitForAccess(gen) {
    return new Promise(function (resolve) {
      var waiter = { gen: gen, resolve: resolve }
      waiter.timer = setTimeout(function () {
        accessWaiters = accessWaiters.filter(function (w) { return w !== waiter })
        resolve(null)
      }, PEER_WAIT)
      accessWaiters.push(waiter)
    })
  }

  // PI keeps the organization of a token family fixed: a refresh never switches it (selectOrg signs in again).
  function rotate() {
    var seen = readSession()
    var seenGen = seen && seen.gen
    return withLock(function () {
      var session = readSession()
      if (!session) throw failure('signed_out')
      takeOffered()
      if (accessValid()) return state.access.token
      // Another tab rotated while this one waited for the lock: its broadcast carries the new access token.
      if (session.gen !== seenGen) {
        return waitForAccess(session.gen).then(function (token) {
          if (token) return token
          var latest = readSession()
          if (!latest) throw failure('signed_out')
          return refreshWith(latest)
        })
      }
      return refreshWith(session)
    })
  }
  function refreshWith(session) {
    return tokenRequest({ grant_type: 'refresh_token', refresh_token: session.refresh_token, client_id: config.clientId }).then(function (body) {
      var latest = readSession()
      if (!latest || latest.gen !== session.gen) throw failure('signed_out')
      var gen = randomToken(9)
      writeJson(local, SESSION_KEY, { v: 1, refresh_token: body.refresh_token, gen: gen, sub: session.sub, org_context: session.org_context || null, login: session.login })
      var expires = expiresAt(body)
      adopt(gen, body.access_token, expires)
      announce({ type: 'tokens', gen: gen, access_token: body.access_token, expires_at: expires })
      sessionChanged()
      return body.access_token
    }, function (error) {
      // Rotation reuse, expiry, or PI's per-grant checks (lock, consent, membership, MFA): the family is revoked.
      if (error.code === 'invalid_grant') {
        localSignOut('session_expired')
        throw failure('session_expired')
      }
      throw error
    })
  }
  function getAccess() {
    if (accessValid()) return Promise.resolve(state.access.token)
    if (!refreshing) {
      refreshing = rotate()
      refreshing.then(function () { refreshing = null }, function () { refreshing = null })
    }
    return refreshing
  }
  function withAuth(call) {
    return getAccess().then(call).then(null, function (error) {
      if (error.code !== 'unauthenticated') throw error
      // One refresh and one retry, then the error stands (no loop).
      state.access = null
      return getAccess().then(call)
    })
  }

  // PI's GET /api/v1/id/me `{ok, user:{id, displayName, email, status}, organizations, orgContext}` in Office's
  // model (contract `Me`); null when the body is not that shape.
  function meFromPi(body) {
    var user = body && body.ok === true ? body.user : null
    if (!user || typeof user.id !== 'string' || !OPAQUE_ID.test(user.id) || !Array.isArray(body.organizations)) return null
    var org = body.orgContext
    if (org !== null && org !== undefined && (typeof org !== 'string' || !OPAQUE_ID.test(org))) return null
    return {
      user_id: user.id,
      display_name: typeof user.displayName === 'string' ? user.displayName : '',
      // Staff-created and phone-only PI accounts have an empty email.
      email: typeof user.email === 'string' && user.email ? user.email : null,
      status: user.status === 'ACTIVE' ? 'active' : 'suspended',
      org_context: org || null,
      memberships: body.organizations.filter(function (o) { return o && typeof o.id === 'string' }).map(function (o) {
        return { org_id: o.id, name: o.name, role: o.myRole, status: typeof o.myStatus === 'string' ? o.myStatus.toLowerCase() : null }
      })
    }
  }
  function profileOf(me) {
    var orgs = me.memberships.filter(function (m) { return m.status === 'active' && OPAQUE_ID.test(m.org_id) })
      .map(function (m) { return { id: m.org_id, name: typeof m.name === 'string' ? m.name : m.org_id, role: typeof m.role === 'string' ? m.role : null } })
    return { v: 1, sub: me.user_id, user: { id: me.user_id, name: me.display_name, email: me.email }, orgs: orgs }
  }

  function fetchMe() {
    var session = readSession()
    if (!session) return Promise.resolve()
    return withAuth(function (token) { return api(endpoint('meEndpoint'), token) }).then(function (body) {
      var me = meFromPi(body)
      if (!me) throw failure('invalid_response')
      var current = readSession()
      if (!current || current.sub !== session.sub) return
      if (me.user_id !== current.sub) {
        console.error('PI /me returned another user than the session')
        throw failure('invalid_response')
      }
      if (me.status === 'suspended') return localSignOut('user_suspended')
      if (me.org_context !== (current.org_context || null)) console.warn('PI orgContext differs from the session')
      writeJson(local, PROFILE_KEY, profileOf(me))
      changed()
    })
  }

  // A list for another product or tenant is discarded whole (products.md §4, HS03 SEV0).
  function saneEntitlements(body, org) {
    if (!body || body.product_id !== product || !Array.isArray(body.entitlements)) return false
    if ((body.org_context || null) !== (org || null)) return false
    return body.entitlements.every(function (e) {
      return e && e.product_id === product && typeof e.feature === 'string' && (e.org_id === null || e.org_id === undefined || e.org_id === body.org_context)
    })
  }
  function fetchEntitlements() {
    var session = readSession()
    if (!session || !product) return Promise.resolve()
    var identity = identityOf(session)
    return withAuth(function (token) { return api(apiPath('/v1/me/entitlements?product_id=' + encodeURIComponent(product)), token) }).then(function (body) {
      var current = readSession()
      if (!current || identityOf(current) !== identity) return
      if (!saneEntitlements(body, current.org_context)) {
        console.error('PI entitlements discarded: tenant isolation check failed')
        throw failure('invalid_response')
      }
      state.entitlements = {
        identity: identity,
        at: mono(),
        list: body.entitlements.map(function (e) {
          return {
            id: String(e.entitlement_id), feature: e.feature, scope: e.scope === 'organization' ? 'organization' : 'personal',
            orgId: e.org_id || null, validTo: e.valid_to || null, offlineAllowed: e.offline_allowed === true
          }
        })
      }
      // Staleness is a state change too: listeners re-evaluate allowed() when the 10 min run out.
      clearTimeout(state.staleTimer)
      state.staleTimer = setTimeout(changed, ENTITLEMENTS_TTL + 1)
      changed()
    })
  }

  function verifyCatalog(jws, minVersion) {
    return new Promise(function (resolve) {
      var parts = typeof jws === 'string' && jws.length <= 8192 ? jws.split('.') : []
      if (parts.length !== 3 || !parts.every(function (p) { return /^[A-Za-z0-9_-]+$/.test(p) })) return resolve(null)
      var header
      try { header = decodeSegment(parts[0]) } catch (e) { return resolve(null) }
      var keys = config.catalogKeys || {}
      // Exactly alg, kid, typ: no jku/jwk/x5u, so the key can only come from the pinned set (lease.md §2).
      if (!header || Object.keys(header).sort().join(',') !== 'alg,kid,typ' || header.alg !== 'EdDSA' || header.typ !== 'pi-feature-catalog+jwt'
        || typeof header.kid !== 'string' || !hasOwn(keys, header.kid)) return resolve(null)
      var subtle = typeof crypto !== 'undefined' && crypto.subtle
      var raw
      try { raw = fromBase64url(keys[header.kid]) } catch (e) { return resolve(null) }
      if (!subtle || raw.length !== 32) return resolve(null)
      // Browsers without Ed25519 in WebCrypto reject here and keep the built-in tiers.
      Promise.resolve().then(function () {
        return subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify'])
      }).then(function (key) {
        return subtle.verify({ name: 'Ed25519' }, key, fromBase64url(parts[2]), utf8(parts[0] + '.' + parts[1]))
      }).then(function (valid) {
        if (!valid) return resolve(null)
        var payload = decodeSegment(parts[1])
        if (!payload || payload.iss !== config.issuer || payload.product !== product || !Array.isArray(payload.features)
          || typeof payload.catalog_version !== 'number' || payload.catalog_version % 1 !== 0 || payload.catalog_version < 1 || payload.catalog_version < minVersion) return resolve(null)
        var tiers = {}
        var wellFormed = payload.features.every(function (entry) {
          if (!entry || typeof entry.feature !== 'string' || entry.feature.length > 64 || !FEATURE_ID.test(entry.feature)) return false
          if (entry.tier !== 'free' && entry.tier !== 'pro') return false
          if (PINNED_FREE.test(entry.feature) && entry.tier === 'pro') console.warn('PI catalog marks pinned-free feature as pro; ignored', entry.feature)
          else if (hasOwn(BUILTIN, entry.feature)) tiers[entry.feature] = entry.tier
          return true
        })
        resolve(wellFormed ? { version: payload.catalog_version, tiers: tiers, jws: jws } : null)
      }).then(null, function () { resolve(null) })
    })
  }
  // Until the cached copy is re-verified it may only make a feature stricter (pro), never free.
  function provisionalPro(jws) {
    var pro = {}
    try {
      decodeSegment(jws.split('.')[1]).features.forEach(function (entry) {
        if (entry && entry.tier === 'pro' && hasOwn(BUILTIN, entry.feature) && !PINNED_FREE.test(entry.feature)) pro[entry.feature] = true
      })
    } catch (e) { return null }
    return pro
  }
  function loadCachedCatalog() {
    var stored = readJson(local, CATALOG_KEY + product)
    if (!stored || typeof stored.jws !== 'string') return Promise.resolve()
    state.provisional = provisionalPro(stored.jws)
    return verifyCatalog(stored.jws, 0).then(function (catalog) {
      state.provisional = null
      if (catalog && (!state.catalog || catalog.version >= state.catalog.version)) {
        state.catalog = catalog
        changed()
      }
    })
  }
  function fetchCatalog() {
    return api(apiPath('/v1/products/' + encodeURIComponent(product) + '/feature-catalog'), null).then(function (body) {
      return verifyCatalog(body && body.catalog, state.catalog ? state.catalog.version : 0)
    }).then(function (catalog) {
      if (!catalog) {
        console.warn('PI feature catalog rejected; keeping the cached or built-in tiers')
        return
      }
      state.catalog = catalog
      writeJson(local, CATALOG_KEY + product, { jws: catalog.jws })
      changed()
    })
  }

  // --- Retry policy (contract §2-3) ------------------------------------------------------------------------

  var TASKS = { me: fetchMe, entitlements: fetchEntitlements, catalog: fetchCatalog }
  // A task started for another sign-in or organization is neither reused nor allowed to schedule retries.
  function run(key) {
    var current = inflight[key]
    if (current && current.identity === known) return current.promise
    var wait = backoff[key]
    if (state.blocked[key] || (wait && wait.until > mono())) return Promise.resolve()
    var entry = { identity: known }
    entry.promise = TASKS[key]().then(function () { settle(key, entry, null) }, function (error) { settle(key, entry, error) })
    inflight[key] = entry
    return entry.promise
  }
  function settle(key, entry, error) {
    if (inflight[key] === entry) inflight[key] = null
    if (entry.identity !== known) return
    var wait = backoff[key]
    if (!error) {
      if (wait) clearTimeout(wait.timer)
      delete backoff[key]
      // The retry note would otherwise outlive the outage; keep it while another task still backs off.
      if (state.error && (state.error.code === 'rate_limited' || state.error.code === 'dependency_unavailable')
        && !Object.keys(backoff).length) {
        state.error = null
        changed()
      }
      return
    }
    var code = error.code
    if (code === 'signed_out' || code === 'session_expired') return
    if (code === 'insufficient_scope' || code === 'user_suspended') return localSignOut(code)
    // PI refuses every refresh of this family too, and a popup cannot open outside a click: sign in again.
    if (code === 'membership_inactive') return dropSession(code)
    if (code === 'network' || code === 'rate_limited' || code === 'dependency_unavailable' || code === 'unauthenticated') {
      wait = backoff[key] || (backoff[key] = { attempt: 0 })
      wait.attempt += 1
      // Retry-After when given, else full jitter from 1 s doubling to 5 min.
      var delay = error.retryAfter !== null ? error.retryAfter * 1000 : Math.random() * Math.min(BACKOFF_MAX, 1000 * Math.pow(2, wait.attempt - 1))
      wait.until = mono() + delay
      clearTimeout(wait.timer)
      wait.timer = setTimeout(function () { run(key) }, delay)
      if (code === 'rate_limited' || code === 'dependency_unavailable') setError(code, error.retryAfter)
      return
    }
    // forbidden, quota_exceeded, malformed data: free features only, no automatic retry until the context changes.
    state.blocked[key] = true
    if (code === 'forbidden' || code === 'quota_exceeded') setError(code)
  }
  function resetRetries() {
    Object.keys(backoff).forEach(function (key) { clearTimeout(backoff[key].timer) })
    backoff = {}
    state.blocked = {}
  }

  // --- State changes ----------------------------------------------------------------------------------------

  function setError(code, retryAfter) {
    state.error = errorInfo(code, retryAfter)
    changed()
  }
  // Only a pinned catalog can make a feature pro; until then no entitlement is fetched (PI has none for Office yet).
  function hasProFeature() {
    return Object.keys(BUILTIN).some(function (feature) { return feature.indexOf(product + '.') === 0 && tier(feature) === 'pro' })
  }
  function loadAccount() {
    run('me')
    if (product && hasProFeature()) run('entitlements')
  }
  function sessionChanged() {
    takeOffered()
    var session = readSession()
    var identity = identityOf(session)
    // Rotation keeps `login`; only the popup's callback writes a new one (also when PI kept the same organization).
    var signedIn = Boolean(pendingSignIn && session && (session.login || '') !== pendingSignIn.login)
    if (identity === known) {
      if (signedIn) finishSignIn(null)
      return changed()
    }
    known = identity
    state.entitlements = null
    resetRetries()
    if (!session) {
      state.access = null
      return changed()
    }
    if (signedIn) finishSignIn(null)
    state.error = null
    changed()
    loadAccount()
  }
  function localSignOut(code) {
    removeKey(local, SESSION_KEY)
    removeKey(local, PROFILE_KEY)
    state.access = null
    state.entitlements = null
    clearTimeout(state.staleTimer)
    resetRetries()
    known = null
    state.error = errorInfo(code)
    announce({ type: 'signed-out' })
    changed()
  }
  function finishSignIn(code) {
    if (!pendingSignIn) return
    var done = pendingSignIn
    pendingSignIn = null
    clearInterval(done.timer)
    if (code && code !== 'cancelled') state.error = errorInfo(code)
    changed()
    done.resolve(snapshot())
  }
  function watchPopup() {
    if (!pendingSignIn) return
    var closed = true
    try { closed = pendingSignIn.popup.closed } catch (e) { closed = true }
    if (!closed) return
    // One more poll first: the callback's broadcast is sent just before the window closes.
    if (pendingSignIn.closedSeen) finishSignIn('cancelled')
    else pendingSignIn.closedSeen = true
  }

  function onMessage(event) {
    var message = event && event.data
    if (!message || typeof message !== 'object') return
    if (message.type === 'tokens') {
      adopt(message.gen, message.access_token, Number(message.expires_at) || 0)
      sessionChanged()
    } else if (message.type === 'signed-out') {
      sessionChanged()
    } else if (message.type === 'sign-in-failed') {
      finishSignIn(typeof message.error === 'string' ? message.error : 'sign_in_failed')
    }
  }
  function onStorage(event) {
    if (event.key === SESSION_KEY || event.key === null) sessionChanged()
    else if (event.key === PROFILE_KEY) changed()
  }

  // --- Public API -------------------------------------------------------------------------------------------

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { freeze(value[key]) })
      Object.freeze(value)
    }
    return value
  }
  function entitlementsFresh() {
    var e = state.entitlements
    return Boolean(e && e.identity === identityOf(readSession()) && mono() - e.at <= ENTITLEMENTS_TTL)
  }
  function snapshot() {
    if (cached) return cached
    var session = enabled ? readSession() : null
    var profile = readProfile(session)
    var orgs = profile && Array.isArray(profile.orgs) ? profile.orgs.map(function (o) { return { id: o.id, name: o.name, role: o.role } }) : []
    var activeId = session && session.org_context
    var active = null
    if (activeId) {
      active = orgs.filter(function (o) { return o.id === activeId })[0] || { id: activeId, name: activeId, role: null }
      active = { id: active.id, name: active.name, role: active.role }
    }
    var current = state.entitlements && session && state.entitlements.identity === identityOf(session) ? state.entitlements.list : []
    cached = freeze({
      version: API_VERSION,
      status: !enabled ? 'disabled' : session ? 'signed-in' : pendingSignIn ? 'signing-in' : 'signed-out',
      user: session ? (profile ? { id: profile.user.id, name: profile.user.name, email: profile.user.email } : { id: session.sub, name: '', email: null }) : null,
      orgs: orgs,
      activeOrg: active,
      product: product,
      entitlements: current.map(function (e) { return Object.assign({}, e) }),
      entitlementsFresh: enabled ? entitlementsFresh() : false,
      error: state.error ? Object.assign({}, state.error) : null
    })
    return cached
  }
  function changed() {
    cached = null
    var current = snapshot()
    listeners.slice().forEach(function (listener) {
      try { listener(current) } catch (e) { console.error(e) }
    })
  }
  function tier(feature) {
    if (PINNED_FREE.test(feature)) return 'free'
    if (state.catalog && hasOwn(state.catalog.tiers, feature)) return state.catalog.tiers[feature]
    if (state.provisional && state.provisional[feature]) return 'pro'
    return BUILTIN[feature]
  }
  function allowed(feature) {
    if (typeof feature !== 'string' || !hasOwn(BUILTIN, feature)) {
      console.error('erpAccount.allowed: feature not in the built-in catalog', feature)
      return false
    }
    if (tier(feature) === 'free') return true
    if (!enabled || !readSession()) return false
    var fresh = entitlementsFresh()
    if (!fresh) {
      if (product) run('entitlements')
      return false
    }
    return state.entitlements.list.some(function (e) { return e.feature === feature })
  }
  function uiLocale() {
    var language = ''
    try { language = String(local.getItem(LANGUAGE_KEY) || '') } catch (e) { language = '' }
    return /^en\b/i.test(language) ? 'en' : 'vi'
  }
  // Must run inside the click handler: popups opened later are blocked. `params` go to PI's authorize request.
  function openPopup(params, session) {
    if (pendingSignIn) {
      try { pendingSignIn.popup.focus() } catch (e) { /* Already closing. */ }
      return pendingSignIn.promise
    }
    if (!local) {
      setError('storage')
      return Promise.resolve(snapshot())
    }
    var popup = null
    var fields = Object.assign({ ui_locales: uiLocale() }, params)
    try { popup = window.open(config.signInPath + '?' + query(fields), POPUP_NAME, 'popup=yes,width=480,height=680') } catch (e) { popup = null }
    if (!popup) {
      setError('popup_blocked')
      return Promise.resolve(snapshot())
    }
    var resolve
    var promise = new Promise(function (r) { resolve = r })
    pendingSignIn = {
      popup: popup, resolve: resolve, promise: promise, closedSeen: false, timer: setInterval(watchPopup, POPUP_POLL),
      login: session ? session.login || '' : null
    }
    state.error = null
    changed()
    return promise
  }
  function signIn() {
    if (!enabled || readSession()) return Promise.resolve(snapshot())
    // PI's own session (12 h) would otherwise sign the same account straight back in after a sign-out.
    return openPopup(readJson(local, SIGNED_OUT_KEY) ? { prompt: 'login' } : {}, null)
  }
  function revoke(refreshToken) {
    return Promise.resolve().then(function () {
      return send(endpoint('revocationEndpoint'), {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: query({ token: refreshToken, token_type_hint: 'refresh_token', client_id: config.clientId })
      })
    }).then(noop, noop)
  }
  function dropSession(code) {
    var session = readSession()
    localSignOut(code)
    if (session) revoke(session.refresh_token)
  }
  // Local state goes first, so a slow or failed revocation never leaves the user signed in (contract §1).
  function signOut() {
    if (!enabled) return Promise.resolve(snapshot())
    var session = readSession()
    if (session) writeJson(local, SIGNED_OUT_KEY, true)
    localSignOut(null)
    return (session ? revoke(session.refresh_token) : Promise.resolve()).then(function () { return snapshot() })
  }
  // PI switches organization only through its authorize page (`org_hint`; personal is a pick on its organization
  // page), never on refresh. Opens the popup, so it must run inside the click handler too.
  function selectOrg(orgId) {
    var session = enabled ? readSession() : null
    if (!session) return Promise.resolve(snapshot())
    var target = orgId ? String(orgId) : 'personal'
    if (target === (session.org_context || 'personal')) return Promise.resolve(snapshot())
    var profile = readProfile(session)
    var member = target === 'personal' || Boolean(profile && Array.isArray(profile.orgs) && profile.orgs.some(function (o) { return o.id === target }))
    if (!member) {
      setError('unknown_org')
      return Promise.resolve(snapshot())
    }
    return openPopup(target === 'personal' ? { prompt: 'select_account' } : { org_hint: target }, session)
  }

  // --- Office API (docs/erp-host.md) -----------------------------------------------------------------------
  // The access token may only reach the site's own API: the check runs on the URL as the browser resolves it, and
  // the request goes out absolute, so neither `..`, `//host`, `\` nor a <base> element can send it elsewhere.
  var API_PREFIX = '/api/v1/'
  function apiUrl(path) {
    if (typeof path !== 'string' || path.charAt(0) !== '/') return null
    var url
    try { url = new URL(path, location.origin) } catch (e) { return null }
    if (url.origin !== location.origin || url.pathname.indexOf(API_PREFIX) !== 0 || url.username || url.password || url.hash) return null
    return url.href
  }
  function plainHeaders(given) {
    var headers = {}
    if (given && typeof given.forEach === 'function' && !Array.isArray(given)) given.forEach(function (value, key) { headers[key] = value })
    else if (Array.isArray(given)) given.forEach(function (pair) { headers[pair[0]] = pair[1] })
    else if (given) Object.keys(given).forEach(function (key) { headers[key] = given[key] })
    Object.keys(headers).forEach(function (key) { if (/^authorization$/i.test(key)) delete headers[key] })
    return headers
  }
  // Throws before any request for a refused URL; a 401 gets one refresh and one retry, then `unauthenticated`.
  function apiFetch(path, init) {
    var url = apiUrl(path)
    if (!url) throw failure('invalid_api_path')
    if (!enabled || !readSession()) return Promise.reject(failure('signed_out'))
    var headers = plainHeaders(init && init.headers)
    function attempt(token) {
      var request = Object.assign({}, init || {}, {
        headers: Object.assign({}, headers, { Authorization: 'Bearer ' + token }),
        credentials: 'omit', cache: 'no-store', redirect: 'error'
      })
      return fetch(url, request).then(null, function () { throw failure('network') })
    }
    return getAccess().then(attempt).then(function (response) {
      if (response.status !== 401) return response
      state.access = null
      return getAccess().then(attempt).then(function (retried) {
        if (retried.status === 401) throw failure('unauthenticated', 401)
        return retried
      })
    })
  }

  window.erpAccount = {
    version: API_VERSION,
    apiFetch: apiFetch,
    status: function () { return snapshot().status },
    user: function () { return snapshot().user },
    orgs: function () { return snapshot().orgs },
    activeOrg: function () { return snapshot().activeOrg },
    selectOrg: selectOrg,
    entitlements: function () { return snapshot().entitlements },
    allowed: allowed,
    signIn: signIn,
    signOut: signOut,
    snapshot: snapshot,
    onChange: function (listener) {
      if (typeof listener !== 'function') return noop
      listeners.push(listener)
      return function () { listeners = listeners.filter(function (l) { return l !== listener }) }
    }
  }

  if (!enabled) return
  if (location.pathname === config.signInPath) return startPage()
  if (location.pathname === config.callbackPath) return callbackPage()
  if (channel) channel.addEventListener('message', onMessage)
  window.addEventListener('storage', onStorage)
  if (product && Object.keys(config.catalogKeys || {}).length) {
    loadCachedCatalog().then(function () { return run('catalog') })
    setInterval(function () { run('catalog') }, CATALOG_INTERVAL)
  }
  if (readSession()) loadAccount()
})()
