// The comment routes of the Office API (plan-m5; erpcons-office-server `/documents/{id}/comments`) on top of a
// FakeOffice: threads with comments, the role matrix (owner/editor/commenter read and write, owner/editor moderate,
// viewer 403, no access 404), Idempotency-Key on create and reply, cursor pages and the anchors batch.
import { problem, type FakeOffice, type OfficeCall } from './fake-office.ts'

export interface FakeComment { id: string; thread_id: string; author_id: string; author_name: string; body: string | null; created_at: string; edited_at: string | null; deleted_at: string | null }
export interface FakeThread {
  id: string; document_id: string; anchor: Record<string, unknown>; region: string | null; created_version: number
  status: 'open' | 'resolved' | 'orphaned'; created_by: string; created_by_name: string; created_at: string; updated_at: string
  resolved_by_name: string | null; resolved_at: string | null; comments: FakeComment[]
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export class FakeComments {
  threads: FakeThread[] = []
  /** Who the page's token belongs to. */
  actor = { id: 'usr_an', name: 'Nguyễn Văn An' }
  calls: OfficeCall[] = []
  private ids = 0
  private keys = new Map<string, Response>()
  private clock = Date.parse('2026-11-02T08:00:00Z')

  private office: FakeOffice

  constructor(office: FakeOffice) {
    this.office = office
    office.on(call => this.handle(call), false)
  }

  nextId() { return `c0aaaaaa-0000-4000-8000-${String(++this.ids).padStart(12, '0')}` }
  private now() { this.clock += 60_000; return new Date(this.clock).toISOString() }

  /** A thread someone (by default another person) started. */
  seed(documentId: string, options: Partial<Omit<FakeThread, 'comments'>> & { body?: string; by?: { id: string; name: string }; replies?: { body: string; by?: { id: string; name: string } }[] } = {}) {
    const by = options.by ?? { id: 'usr_binh', name: 'Trần Thị Bình' }
    const id = options.id ?? this.nextId()
    const at = this.now()
    const thread: FakeThread = {
      id, document_id: documentId, anchor: options.anchor ?? { kind: 'document' }, region: options.region ?? null, created_version: 1,
      status: options.status ?? 'open', created_by: by.id, created_by_name: by.name, created_at: options.created_at ?? at, updated_at: at,
      resolved_by_name: options.status === 'resolved' ? 'Nguyễn Văn An' : null, resolved_at: options.status === 'resolved' ? at : null,
      comments: [],
    }
    thread.comments.push(this.comment(thread, options.body ?? 'Xem lại số liệu này', by))
    for (const reply of options.replies ?? []) thread.comments.push(this.comment(thread, reply.body, reply.by ?? by))
    this.threads.push(thread)
    return thread
  }
  private comment(thread: FakeThread, body: string, by: { id: string; name: string }): FakeComment {
    return { id: this.nextId(), thread_id: thread.id, author_id: by.id, author_name: by.name, body, created_at: this.now(), edited_at: null, deleted_at: null }
  }
  thread(id: string) { return this.threads.find(t => t.id === id) }

  private commentDto(c: FakeComment) {
    const { author_id, ...rest } = c
    return { ...rest, mine: author_id === this.actor.id }
  }
  private threadDto(t: FakeThread) {
    const { created_by, comments, ...rest } = t
    return { ...rest, mine: created_by === this.actor.id, comments: comments.map(c => this.commentDto(c)) }
  }

  private handle(call: OfficeCall): Response | undefined {
    const url = new URL(call.path, 'https://office.erpcons.ai')
    const match = /^\/api\/v1\/documents\/([^/]+)\/comments(?:\/([^/]+))?(?:\/(replies|resolve|reopen|comments)(?:\/([^/]+))?)?$/.exec(url.pathname)
    if (!match) return undefined
    this.calls.push(call)
    const docId = decodeURIComponent(match[1])
    const doc = this.office.docs.get(docId)
    if (!doc) return problem(404, 'NOT_FOUND')
    if (!['owner', 'editor', 'commenter'].includes(doc.role)) return problem(403, 'FORBIDDEN')
    const moderator = doc.role === 'owner' || doc.role === 'editor'
    const body = typeof call.body === 'string' ? JSON.parse(call.body) as Record<string, unknown> : {}
    const key = call.headers['Idempotency-Key']
    const replay = key ? this.keys.get(`${call.method} ${url.pathname} ${key}`) : undefined
    if (replay) return replay.clone()
    const remember = (response: Response) => {
      if (key) this.keys.set(`${call.method} ${url.pathname} ${key}`, response.clone())
      return response
    }
    const [, , tid, action, cid] = match
    const own = this.threads.filter(t => t.document_id === docId)

    if (!tid) {
      if (call.method === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? 50)
        const start = Number(url.searchParams.get('cursor') ?? 0)
        const page = own.slice(start, start + limit)
        const next = start + limit < own.length ? String(start + limit) : null
        return json(200, { threads: page.map(t => this.threadDto(t)), next_cursor: next, can_resolve: moderator })
      }
      if (call.method === 'POST') {
        if (!key) return problem(422, 'INVALID_REQUEST')
        if (typeof body.body !== 'string' || !body.body.trim() || typeof body.anchor !== 'object') return problem(422, 'INVALID_REQUEST')
        const thread = this.seed(docId, { anchor: body.anchor as Record<string, unknown>, region: (body.region as string) ?? null, body: body.body, by: this.actor })
        thread.created_version = typeof body.version === 'number' ? body.version : 1
        return remember(json(201, this.threadDto(thread)))
      }
      return problem(405, 'METHOD_NOT_ALLOWED')
    }
    if (tid === 'anchors' && call.method === 'PATCH') {
      let updated = 0
      for (const u of (body.updates as Record<string, unknown>[]) ?? []) {
        const t = own.find(x => x.id === u.thread_id)
        if (!t) continue
        if (u.anchor) t.anchor = u.anchor as Record<string, unknown>
        if ('region' in u) t.region = (u.region as string | null) ?? null
        if ((u.status === 'open' || u.status === 'orphaned') && t.status !== 'resolved') t.status = u.status
        updated += 1
      }
      return json(200, { updated })
    }
    const thread = own.find(t => t.id === decodeURIComponent(tid))
    if (!thread) return problem(404, 'NOT_FOUND')
    if (!action) {
      if (call.method === 'GET') return json(200, this.threadDto(thread))
      if (call.method === 'DELETE') {
        if (!moderator) return problem(403, 'FORBIDDEN')
        this.threads = this.threads.filter(t => t !== thread)
        return new Response(null, { status: 204 })
      }
    }
    if (action === 'replies' && call.method === 'POST') {
      if (!key) return problem(422, 'INVALID_REQUEST')
      const comment = this.comment(thread, String(body.body), this.actor)
      thread.comments.push(comment)
      return remember(json(201, this.commentDto(comment)))
    }
    if ((action === 'resolve' || action === 'reopen') && call.method === 'POST') {
      if (!moderator) return problem(403, 'FORBIDDEN')
      thread.status = action === 'resolve' ? 'resolved' : 'open'
      thread.resolved_by_name = action === 'resolve' ? this.actor.name : null
      thread.resolved_at = action === 'resolve' ? this.now() : null
      return json(200, this.threadDto(thread))
    }
    if (action === 'comments' && cid) {
      const comment = thread.comments.find(c => c.id === decodeURIComponent(cid) && !c.deleted_at)
      if (!comment) return problem(404, 'NOT_FOUND')
      if (comment.author_id !== this.actor.id) return problem(403, 'FORBIDDEN')
      if (call.method === 'PATCH') {
        comment.body = String(body.body)
        comment.edited_at = this.now()
        return json(200, this.commentDto(comment))
      }
      if (call.method === 'DELETE') {
        comment.body = null
        comment.deleted_at = this.now()
        if (thread.comments.every(c => c.deleted_at)) this.threads = this.threads.filter(t => t !== thread)
        return new Response(null, { status: 204 })
      }
    }
    return problem(405, 'METHOD_NOT_ALLOWED')
  }
}
