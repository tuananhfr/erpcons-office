// An in-memory Office API (erpcons-office-server/docs/openapi.yaml) behind a fake erpAccount, for the online-*.js
// tests: documents with immutable versions, strong ETags, If-Match on save, multipart create, the Error body.
export const DOC_ID = '0b9d6c1e-4f2a-4c3b-9d8e-7a6b5c4d3e2f'
export const OTHER_ID = '7f3e2d1c-0b9a-4876-8543-210fedcba987'

export interface OfficeCall { method: string; path: string; headers: Record<string, string>; body: unknown }
type Hook = (call: OfficeCall) => Response | Promise<Response> | undefined

interface StoredDoc { id: string; title: string; format: string; folderId: string | null; versions: Uint8Array[]; role: string; canDownload: boolean; canShare: boolean }

export const problem = (status: number, code: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ code, message_vi: `Lỗi ${code}`, request_id: 'req-1', retryable: status === 429 || status === 503, ...extra }), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  })

export class FakeOffice {
  docs = new Map<string, StoredDoc>()
  calls: OfficeCall[] = []
  offline = false
  /** Rejections apiFetch would give instead of a response (account.js codes), consumed one per call. */
  rejections: string[] = []
  private hooks: { hook: Hook; once: boolean }[] = []
  private created = 0
  /** Public view links: token → document id. */
  links = new Map<string, string>()
  linkCalls: { path: string; init: RequestInit }[] = []

  add(id: string, title: string, format: string, bytes: Uint8Array, folderId: string | null = null, role = 'owner') {
    this.docs.set(id, { id, title, format, folderId, versions: [bytes], role, canDownload: true, canShare: true })
    return this
  }
  /** The caller's role changes on the server (shared by someone else, downgraded, removed with `null`). */
  setRole(id: string, role: string | null, canDownload = true) {
    const doc = this.docs.get(id)!
    if (role === null) { this.docs.delete(id); return }
    doc.role = role
    doc.canDownload = canDownload
  }
  /** The owner's "editors can share" switch; `can_share` follows the server rule from it and the role. */
  setCanShare(id: string, canShare: boolean) { this.docs.get(id)!.canShare = canShare }
  etag(id: string, version: number) { return `"${id.slice(0, 8)}-v${version}"` }
  version(id: string) { return this.docs.get(id)!.versions.length }
  latest(id: string) { const doc = this.docs.get(id)!; return doc.versions[doc.versions.length - 1] }
  /** Someone else saves a version in between. */
  saveElsewhere(id: string, bytes: Uint8Array) { this.docs.get(id)!.versions.push(bytes) }
  on(hook: Hook, once = true) { this.hooks.push({ hook, once }) }
  /** The next PUT waits until the returned function is called, then is answered normally. */
  holdNextPut(): () => void {
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })
    this.on(call => (call.method === 'PUT' ? gate.then(() => this.route(call)) : undefined))
    return release
  }
  puts() { return this.calls.filter(c => c.method === 'PUT') }

  private meta(doc: StoredDoc) {
    return {
      id: doc.id, folder_id: doc.folderId, title: doc.title, kind: 'word', format: doc.format, size: doc.versions.at(-1)!.length,
      version: doc.versions.length, save_state: 'SERVER_DURABLE', state: 'ACTIVE', trashed_at: null,
      created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T08:00:00Z',
      role: doc.role, owner_name: 'Nguyễn Văn An', shared: false, can_download: doc.canDownload, can_share: doc.role === 'owner' || (doc.role === 'editor' && doc.canShare),
    }
  }
  private json(status: number, body: unknown, headers: Record<string, string> = {}) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
  }

  /** Stands in for erpAccount.apiFetch: same-origin `/api/v1/` paths only, like the real one. */
  apiFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
    if (typeof path !== 'string' || !path.startsWith('/api/v1/')) throw Object.assign(new Error('invalid_api_path'), { code: 'invalid_api_path' })
    const headers = { ...(init.headers as Record<string, string>) }
    const call: OfficeCall = { method: init.method ?? 'GET', path, headers, body: init.body }
    this.calls.push(call)
    const rejection = this.rejections.shift()
    if (rejection) return Promise.reject(Object.assign(new Error(rejection), { code: rejection }))
    if (this.offline) return Promise.reject(Object.assign(new Error('network'), { code: 'network' }))
    for (const entry of [...this.hooks]) {
      const answer = entry.hook(call)
      if (answer) {
        if (entry.once) this.hooks = this.hooks.filter(h => h !== entry)
        return Promise.resolve(answer)
      }
    }
    return Promise.resolve(this.route(call))
  }

  /** Stands in for window.fetch on the public link page: `/api/v1/link` and `/content` only, token in `X-Link-Token`. */
  linkFetch = (path: string, init: RequestInit = {}): Promise<Response> => {
    this.linkCalls.push({ path, init })
    if (this.offline) return Promise.reject(new TypeError('Failed to fetch'))
    const match = /^\/api\/v1\/link(\/content)?$/.exec(path)
    const token = new Headers(init.headers).get('X-Link-Token')
    const id = match && token ? this.links.get(token) : undefined
    const doc = id ? this.docs.get(id) : undefined
    if (!match || !doc) return Promise.resolve(problem(404, 'NOT_FOUND'))
    if (match[1]) {
      return Promise.resolve(new Response(doc.versions.at(-1)!.slice(), { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'X-Document-Version': String(doc.versions.length) } }))
    }
    return Promise.resolve(this.json(200, { ...this.meta(doc), folder_id: null, role: 'link' }))
  }

  private route(call: OfficeCall): Response | Promise<Response> {
    const match = /^\/api\/v1\/documents\/([^/]+)(\/content|\/versions\/(\d+)\/content)?$/.exec(call.path)
    if (call.path === '/api/v1/documents' && call.method === 'POST') return this.create(call)
    if (!match) return problem(404, 'NOT_FOUND')
    const doc = this.docs.get(decodeURIComponent(match[1]))
    if (!doc) return problem(404, 'NOT_FOUND')
    const version = doc.versions.length
    if (match[3]) {
      if (doc.role !== 'owner' && doc.role !== 'editor') return problem(403, 'FORBIDDEN')
      const bytes = doc.versions[Number(match[3]) - 1]
      if (!bytes) return problem(404, 'NOT_FOUND')
      return new Response(bytes.slice(), { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'X-Document-Version': match[3] } })
    }
    if (!match[2] && call.method === 'GET') return this.json(200, this.meta(doc), { ETag: this.etag(doc.id, version) })
    if (match[2] && call.method === 'GET') {
      return new Response(doc.versions.at(-1)!.slice(), { status: 200, headers: { 'Content-Type': 'application/octet-stream', ETag: this.etag(doc.id, version), 'X-Document-Version': String(version) } })
    }
    if (match[2] && call.method === 'PUT') {
      if (doc.role !== 'owner' && doc.role !== 'editor') return problem(403, 'FORBIDDEN')
      const ifMatch = call.headers['If-Match']
      if (!ifMatch) return problem(428, 'PRECONDITION_REQUIRED')
      if (ifMatch !== this.etag(doc.id, version)) return problem(409, 'VERSION_CONFLICT', { latest_version: version })
      doc.versions.push(new Uint8Array(call.body as Uint8Array))
      return this.json(200, this.meta(doc), { ETag: this.etag(doc.id, doc.versions.length) })
    }
    return problem(405, 'METHOD_NOT_ALLOWED')
  }

  private async create(call: OfficeCall): Promise<Response> {
    const form = call.body as FormData
    if (!call.headers['Idempotency-Key']) return problem(422, 'INVALID_REQUEST')
    const file = form.get('file') as Blob
    const id = `c0de0000-0000-4000-8000-${String(++this.created).padStart(12, '0')}`
    const title = String(form.get('title'))
    const format = (file as File).name.split('.').pop() ?? ''
    this.add(id, title, format, new Uint8Array(await file.arrayBuffer()), (form.get('folder_id') as string | null) ?? null)
    return this.json(201, this.meta(this.docs.get(id)!), { ETag: this.etag(id, 1) })
  }
}

export interface FakeAccountState { status: 'signed-in' | 'signed-out' | 'disabled'; sub: string }

/** The parts of window.erpAccount online.js uses. */
export function fakeAccount(office: FakeOffice, state: FakeAccountState = { status: 'signed-in', sub: 'usr_an' }) {
  const listeners: ((snapshot: { status: string }) => void)[] = []
  const account = {
    version: 1,
    state,
    signOuts: 0,
    signIns: 0,
    status: () => state.status,
    user: () => (state.status === 'signed-in' ? { id: state.sub, name: 'Nguyễn Văn An', email: null } : null),
    onChange: (fn: (snapshot: { status: string }) => void) => { listeners.push(fn); return () => {} },
    signIn: () => { account.signIns += 1; return Promise.resolve({ status: state.status }) },
    signOut: () => { account.signOuts += 1; state.status = 'signed-out'; return Promise.resolve({ status: 'signed-out' }) },
    apiFetch: office.apiFetch,
    /** Changes the status (and the account, for a sign-in as someone else) and tells the listeners, as account.js does. */
    set(status: FakeAccountState['status'], sub = state.sub) {
      state.status = status
      state.sub = sub
      listeners.forEach(fn => fn({ status }))
    },
  }
  return account
}
