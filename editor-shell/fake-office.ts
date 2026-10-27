// An in-memory Office API (erpcons-office-server/docs/openapi.yaml) behind a fake erpAccount, for the online-*.js
// tests: documents with immutable versions, strong ETags, If-Match on save, multipart create, the Error body.
export const DOC_ID = '0b9d6c1e-4f2a-4c3b-9d8e-7a6b5c4d3e2f'
export const OTHER_ID = '7f3e2d1c-0b9a-4876-8543-210fedcba987'

export interface OfficeCall { method: string; path: string; headers: Record<string, string>; body: unknown }
type Hook = (call: OfficeCall) => Response | Promise<Response> | undefined

interface StoredDoc { id: string; title: string; format: string; folderId: string | null; versions: Uint8Array[] }

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

  add(id: string, title: string, format: string, bytes: Uint8Array, folderId: string | null = null) {
    this.docs.set(id, { id, title, format, folderId, versions: [bytes] })
    return this
  }
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

  private route(call: OfficeCall): Response | Promise<Response> {
    const match = /^\/api\/v1\/documents\/([^/]+)(\/content)?$/.exec(call.path)
    if (call.path === '/api/v1/documents' && call.method === 'POST') return this.create(call)
    if (!match) return problem(404, 'NOT_FOUND')
    const doc = this.docs.get(decodeURIComponent(match[1]))
    if (!doc) return problem(404, 'NOT_FOUND')
    const version = doc.versions.length
    if (!match[2] && call.method === 'GET') return this.json(200, this.meta(doc), { ETag: this.etag(doc.id, version) })
    if (match[2] && call.method === 'GET') {
      return new Response(doc.versions.at(-1)!.slice(), { status: 200, headers: { 'Content-Type': 'application/octet-stream', ETag: this.etag(doc.id, version), 'X-Document-Version': String(version) } })
    }
    if (match[2] && call.method === 'PUT') {
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
    /** Changes the status and tells the listeners, as account.js does. */
    set(status: FakeAccountState['status']) {
      state.status = status
      listeners.forEach(fn => fn({ status }))
    },
  }
  return account
}
