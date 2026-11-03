import { describe, expect, it, vi } from 'vitest'
import { FakeComments } from './fake-comments.ts'
import { FakeEvent, type FakeElement } from './fake-dom.ts'
import { DOC_ID, FakeOffice, problem } from './fake-office.ts'
import { fakeWebSocket, type FakeSocket } from './fake-websocket.ts'
import { flush, onlinePage, type HostDoc, type PageOptions } from './online-harness.ts'

// Comments on the editor page (plan-m5, site): online-comments-api.js, -state.js, -panel.js, online-comments.js and
// their wiring in online.js, against the comment routes of erpcons-office-server (fake-comments.ts).
vi.setConfig({ testTimeout: 30 * 1000 })

type Page = ReturnType<typeof onlinePage>
type Online = Record<string, (...args: never[]) => unknown>

const bytes = (...values: number[]) => new Uint8Array(values)
const ANCHOR = { region: 'para:1a2b3c', quote: 'doanh thu quý ba', order: [3, 120], offset: 4, soft: { before: 'Tổng ', after: ' tăng' } }

interface ForkLog { opened: HostDoc[]; shown: unknown[][]; focused: unknown[][]; resolved: unknown[][] }
interface ForkOptions { anchor?: () => unknown; resolve?: (threads: { id: string; anchor: Record<string, unknown>; status: string }[]) => unknown; noComments?: boolean }

/** A fork that speaks the v3 comment calls (or none of them with `noComments`). */
function commentFork(page: Page, options: ForkOptions = {}): ForkLog {
  const log: ForkLog = { opened: [], shown: [], focused: [], resolved: [] }
  const handlers: Record<string, unknown> = {
    open: (doc: HostDoc) => {
      log.opened.push(doc)
      page.host!.opened(doc.docId, true)
    },
    setMode: () => {}, setUser: () => {},
  }
  if (!options.noComments) {
    Object.assign(handlers, {
      anchorOfSelection: options.anchor ?? (() => ANCHOR),
      showComments: (threads: unknown[]) => { log.shown.push(threads) },
      focusAnchor: (...args: unknown[]) => { log.focused.push(args) },
      resolveAnchors: (threads: { id: string; anchor: Record<string, unknown>; status: string }[]) => {
        log.resolved.push(threads)
        return options.resolve ? options.resolve(threads) : []
      },
    })
  }
  page.host!.ready(handlers as never)
  return log
}

async function commentPage(role = 'owner', options: PageOptions & ForkOptions & { seed?: (c: FakeComments) => void } = {}) {
  const office = options.office ?? new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, role)
  const comments = new FakeComments(office)
  options.seed?.(comments)
  const page = onlinePage({ ...options, office })
  const fork = commentFork(page, options)
  await page.settle()
  return { page, office, comments, fork }
}
async function tick(page: Page, ms: number) {
  await flush()
  page.clock.advance(ms)
  await page.settle()
}

const q = (page: Page, selector: string) => page.document.querySelector(selector)
const panel = (page: Page) => q(page, '[data-erp-comments]')!
const barButton = (page: Page, key: string) => q(page, `[data-erp-online-${key}]`)!
const threadCards = (page: Page, under = '[data-erp-comments-body]') => q(page, under)?.querySelectorAll('[data-erp-comment-thread]') ?? []
const threadIds = (page: Page, under?: string) => threadCards(page, under).map(n => n.getAttribute('data-erp-comment-thread'))
const commentCalls = (c: FakeComments, method?: string) => c.calls.filter(call => !method || call.method === method)
function typeInto(area: FakeElement, text: string) {
  ;(area as unknown as { value: string }).value = text
  area.dispatch(new FakeEvent('input'))
}
function card(page: Page, id: string) { return q(page, `[data-erp-comment-thread="${id}"]`)! }
function onlineApi(page: Page) { return page.window.erpOnline as Online }

describe('API client', () => {
  it('reads every page of threads, oldest first, and drops malformed entries', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    const comments = new FakeComments(office)
    for (let i = 0; i < 250; i++) comments.seed(DOC_ID, { body: `n${i}` })
    const page = onlinePage({ office })
    const api = (onlineApi(page).createCommentsApi as (f: unknown) => { list(id: string): Promise<{ kind: string; threads: { id: string; comments: { body: string }[] }[]; canResolve: boolean }> })(office.apiFetch)
    const outcome = await api.list(DOC_ID)
    expect(outcome.kind).toBe('ok')
    expect(outcome.threads).toHaveLength(250)
    expect(outcome.threads[0].comments[0].body).toBe('n0')
    expect(outcome.canResolve).toBe(true)
    expect(commentCalls(comments, 'GET').map(c => c.path)).toEqual([
      `/api/v1/documents/${DOC_ID}/comments?limit=200`,
      `/api/v1/documents/${DOC_ID}/comments?limit=200&cursor=200`,
    ])
  })

  it('create and reply carry an Idempotency-Key and JSON; a replayed key gives the same thread', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    const comments = new FakeComments(office)
    const page = onlinePage({ office })
    const api = (onlineApi(page).createCommentsApi as (f: unknown) => Record<string, (...a: unknown[]) => Promise<Record<string, { id: string }>>>)(office.apiFetch)
    const first = await api.create(DOC_ID, { anchor: ANCHOR, region: 'para:1a2b3c', version: 1, body: 'Kiểm lại' }, 'key-1')
    const again = await api.create(DOC_ID, { anchor: ANCHOR, region: 'para:1a2b3c', version: 1, body: 'Kiểm lại' }, 'key-1')
    expect(again.thread.id).toBe(first.thread.id)
    expect(comments.threads).toHaveLength(1)
    const post = commentCalls(comments, 'POST')[0]
    expect(post.headers['Idempotency-Key']).toBe('key-1')
    expect(post.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(post.body as string)).toEqual({ anchor: ANCHOR, region: 'para:1a2b3c', version: 1, body: 'Kiểm lại' })
    await api.reply(DOC_ID, first.thread.id, 'Đã sửa', 'key-2')
    expect(commentCalls(comments, 'POST')[2].headers['Idempotency-Key']).toBe('key-2')
  })

  it('maps 403, 404 and a lost network; a malformed thread id never leaves the page', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1), null, 'viewer')
    const comments = new FakeComments(office)
    const page = onlinePage({ office })
    const api = (onlineApi(page).createCommentsApi as (f: unknown) => Record<string, (...a: unknown[]) => Promise<{ kind: string }>>)(office.apiFetch)
    expect((await api.list(DOC_ID)).kind).toBe('ok')
    expect((await api.create(DOC_ID, { anchor: ANCHOR, region: null, version: 1, body: 'x' }, 'k')).kind).toBe('forbidden')
    office.setRole(DOC_ID, 'owner')
    expect((await api.get(DOC_ID, '0b9d6c1e-0000-4000-8000-000000000999')).kind).toBe('notFound')
    expect((await api.get(DOC_ID, '../../folders')).kind).toBe('notFound')
    expect(comments.calls.some(c => c.path.includes('folders'))).toBe(false)
    office.offline = true
    expect((await api.list(DOC_ID)).kind).toBe('offline')
  })

  it('sends anchor changes in batches of the server limit (200)', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    const comments = new FakeComments(office)
    const page = onlinePage({ office })
    const api = (onlineApi(page).createCommentsApi as (f: unknown) => Record<string, (...a: unknown[]) => Promise<{ kind: string }>>)(office.apiFetch)
    const updates = Array.from({ length: 450 }, (_, i) => ({ thread_id: `c0aaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`, status: 'orphaned' }))
    expect(await api.patchAnchors(DOC_ID, updates)).toEqual({ kind: 'ok', updated: 0 })
    expect(commentCalls(comments, 'PATCH').map(c => (JSON.parse(c.body as string) as { updates: unknown[] }).updates.length)).toEqual([200, 200, 50])
  })
})

describe('panel state', () => {
  const thread = (id: string, extra: Record<string, unknown> = {}) => ({ id, anchor: { kind: 'document' }, status: 'open', createdAt: `2026-11-02T08:0${id}:00Z`, resolvedAt: null, comments: [], ...extra })

  it('orders placed threads by the editor position key, then general ones by time; orphaned and resolved apart', () => {
    const page = onlinePage()
    const sections = (onlineApi(page).commentSections as (t: unknown[]) => Record<string, { id: string }[]> & { counts: { open: number; resolved: number } })([
      thread('1'),
      thread('2', { anchor: { order: [5, 10] } }),
      thread('3', { anchor: { order: [2, 400] } }),
      thread('4', { anchor: { order: [5, 2] } }),
      thread('5', { status: 'orphaned', anchor: { order: [1] } }),
      thread('6', { status: 'resolved', resolvedAt: '2026-11-02T09:00:00Z' }),
      thread('7', { status: 'resolved', resolvedAt: '2026-11-02T10:00:00Z' }),
    ])
    expect(sections.open.map(t => t.id)).toEqual(['3', '4', '2', '1'])
    expect(sections.orphaned.map(t => t.id)).toEqual(['5'])
    expect(sections.resolved.map(t => t.id)).toEqual(['7', '6'])
    expect(sections.counts).toEqual({ open: 5, resolved: 2 })
  })

  it('rights per role and mode: viewers and link holders only read; resolve is the server’s word', () => {
    const page = onlinePage()
    const rights = onlineApi(page).commentRights as (role: string, mode: string, canResolve?: boolean) => unknown
    expect(rights('owner', 'edit')).toEqual({ see: true, write: true, resolve: true })
    expect(rights('editor', 'edit', true)).toEqual({ see: true, write: true, resolve: true })
    expect(rights('commenter', 'comment', false)).toEqual({ see: true, write: true, resolve: false })
    expect(rights('editor', 'view')).toEqual({ see: true, write: false, resolve: false })
    expect(rights('viewer', 'view')).toEqual({ see: true, write: false, resolve: false })
    expect(rights('link', 'view')).toEqual({ see: true, write: false, resolve: false })
    expect(rights('viewer', 'comment')).toEqual({ see: true, write: false, resolve: false })
  })

  it('keeps only real anchor changes, never a resolved status move', () => {
    const page = onlinePage()
    const store = (onlineApi(page).createCommentStore as () => { reset(t: unknown[]): void })()
    store.reset([thread('1', { anchor: { region: 'r1', order: [1] } }), thread('2', { anchor: { region: 'r2' }, status: 'resolved' }), thread('3')])
    const changes = (onlineApi(page).anchorChanges as (u: unknown, s: unknown) => unknown[])([
      { threadId: '1', anchor: { region: 'r1', order: [1] }, status: 'open' },
      { threadId: '1', anchor: { region: 'r9', order: [2] } },
      { threadId: '2', status: 'orphaned' },
      { threadId: '3', status: 'orphaned' },
      { threadId: 'nope', status: 'orphaned' },
    ], store)
    expect(changes).toEqual([])
    const moved = (onlineApi(page).anchorChanges as (u: unknown, s: unknown) => unknown[])([{ threadId: '1', anchor: { region: 'r9', order: [2] }, status: 'orphaned' }], store)
    expect(moved).toEqual([{ thread_id: '1', anchor: { region: 'r9', order: [2] }, region: 'r9', status: 'orphaned' }])
  })
})

describe('who sees comments', () => {
  it('owner: "Thêm nhận xét" and "Nhận xét" with the open count; the panel lists threads with resolve and delete', async () => {
    const { page } = await commentPage('owner', { seed: c => { c.seed(DOC_ID); c.seed(DOC_ID, { status: 'resolved' }) } })
    expect(barButton(page, 'comment').hidden).toBe(false)
    expect(barButton(page, 'comments').hidden).toBe(false)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('1')
    barButton(page, 'comments').click()
    await page.settle()
    expect(panel(page).hidden).toBe(false)
    expect(barButton(page, 'comments').getAttribute('aria-pressed')).toBe('true')
    expect(threadCards(page)).toHaveLength(1)
    expect(q(page, '[data-erp-thread-resolve]')).not.toBeNull()
    expect(q(page, '[data-erp-thread-delete]')).not.toBeNull()
  })

  it('commenter: may add and reply, not resolve or delete threads (can_resolve false)', async () => {
    const { page } = await commentPage('commenter', { seed: c => { c.seed(DOC_ID) } })
    expect(barButton(page, 'comment').hidden).toBe(false)
    barButton(page, 'comments').click()
    await page.settle()
    expect(q(page, '[data-erp-thread-reply]')).not.toBeNull()
    expect(q(page, '[data-erp-thread-resolve]')).toBeNull()
    expect(q(page, '[data-erp-thread-delete]')).toBeNull()
  })

  it('viewer: reads threads, marks and "Không còn vị trí" read-only, with no button that writes and only GETs', async () => {
    const { page, comments, fork } = await commentPage('viewer', {
      seed: c => {
        c.seed(DOC_ID, { anchor: ANCHOR, replies: [{ body: 'Đã sửa' }] })
        c.seed(DOC_ID, { anchor: { region: 'para:x' }, status: 'orphaned' })
        c.seed(DOC_ID, { status: 'resolved' })
      },
    })
    expect(barButton(page, 'comment').hidden).toBe(true)
    expect(barButton(page, 'comments').hidden).toBe(false)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('2')
    barButton(page, 'comments').click()
    await page.settle()
    expect(panel(page).hidden).toBe(false)
    expect(threadIds(page, '[data-erp-comments-open]')).toEqual([comments.threads[0].id])
    expect(threadIds(page, '[data-erp-comments-orphaned]')).toEqual([comments.threads[1].id])
    expect(card(page, comments.threads[0].id).textContent).toContain('Đã sửa')
    expect(fork.shown.at(-1)).toHaveLength(2)
    for (const selector of ['[data-erp-comments-add]:not([hidden])', '[data-erp-thread-reply]', '[data-erp-thread-resolve]', '[data-erp-thread-reopen]', '[data-erp-thread-delete]', '[data-erp-comment-edit]', '[data-erp-comment-delete]']) {
      expect(q(page, selector), selector).toBeNull()
    }
    expect(q(page, '[data-erp-comments-readonly]')!.textContent).toBe('Bạn chỉ xem được nhận xét, không thêm hay trả lời.')
    q(page, '[data-erp-comments-filter="resolved"]')!.click()
    await page.settle()
    expect(threadIds(page)).toEqual([comments.threads[2].id])
    expect(q(page, '[data-erp-thread-reopen]')).toBeNull()
    expect(comments.calls.every(call => call.method === 'GET')).toBe(true)
    expect(fork.resolved).toEqual([])
  })

  it('a version page (&version=) has no comments at all', async () => {
    const { page, comments } = await commentPage('owner', { search: `?doc=${DOC_ID}&version=1`, seed: c => { c.seed(DOC_ID) } })
    expect(q(page, '[data-erp-comments]')).toBeNull()
    expect(comments.calls).toEqual([])
  })

  it('a role taken down to viewer while open keeps the panel and the marks, read-only', async () => {
    const { page, office, fork } = await commentPage('editor', { seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) } })
    barButton(page, 'comments').click()
    await page.settle()
    expect(fork.shown.at(-1)).toHaveLength(1)
    expect(q(page, '[data-erp-thread-reply]')).not.toBeNull()
    office.setRole(DOC_ID, 'viewer')
    await tick(page, 31 * 1000)
    expect(panel(page).hidden).toBe(false)
    expect(barButton(page, 'comments').hidden).toBe(false)
    expect(barButton(page, 'comment').hidden).toBe(true)
    expect(q(page, '[data-erp-thread-reply]')).toBeNull()
    expect(q(page, '[data-erp-thread-resolve]')).toBeNull()
    expect(fork.shown.at(-1)).toHaveLength(1)
  })

})

describe('adding a comment', () => {
  it('no selection: the toast "Chọn nội dung để nhận xét" and nothing opens', async () => {
    const { page } = await commentPage('owner', { anchor: () => null })
    barButton(page, 'comment').click()
    await page.settle()
    expect(page.notices.at(-1)).toEqual({ text: 'Chọn nội dung để nhận xét', role: 'status' })
    expect(panel(page).hidden).toBe(true)
  })

  it('the selection becomes the anchor: quote shown, POST with anchor, region and version, the mark drawn', async () => {
    const { page, comments, fork } = await commentPage('owner')
    barButton(page, 'comment').click()
    await page.settle()
    expect(panel(page).hidden).toBe(false)
    const composer = q(page, '[data-erp-comments-composer]')!
    expect(composer.textContent).toContain('doanh thu quý ba')
    typeInto(q(page, '[data-erp-comments-input="new"]')!, 'Số này chưa khớp')
    q(page, '[data-erp-comments-submit="new"]')!.click()
    await page.settle()
    const post = commentCalls(comments, 'POST')[0]
    expect(JSON.parse(post.body as string)).toEqual({ anchor: ANCHOR, region: 'para:1a2b3c', version: 1, body: 'Số này chưa khớp' })
    expect(q(page, '[data-erp-comments-composer]')).toBeNull()
    const id = comments.threads[0].id
    expect(threadIds(page)).toEqual([id])
    expect(card(page, id).className).toContain('erp-thread--active')
    expect(fork.shown.at(-1)).toEqual([{ id, anchor: ANCHOR, status: 'open', count: 1 }])
  })

  it('an editor without anchorOfSelection: a document-wide thread, labelled "Nhận xét chung"', async () => {
    const { page, comments } = await commentPage('owner', { noComments: true })
    barButton(page, 'comment').click()
    await page.settle()
    expect(q(page, '[data-erp-comments-composer]')!.textContent).toContain('Nhận xét chung')
    typeInto(q(page, '[data-erp-comments-input="new"]')!, 'Góp ý chung')
    q(page, '[data-erp-comments-submit="new"]')!.click()
    await page.settle()
    expect(JSON.parse(commentCalls(comments, 'POST')[0].body as string)).toEqual({ anchor: { kind: 'document' }, version: 1, body: 'Góp ý chung' })
    expect(card(page, comments.threads[0].id).textContent).toContain('Nhận xét chung')
  })

  it('Ctrl+Alt+M adds in edit and comment mode, and does nothing for a viewer', async () => {
    for (const [role, opens] of [['owner', true], ['commenter', true], ['viewer', false]] as const) {
      const { page } = await commentPage(role)
      const key = new FakeEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true } as never)
      page.document.fire(key)
      await page.settle()
      expect(panel(page).hidden, role).toBe(!opens)
      expect(key.defaultPrevented, role).toBe(opens)
    }
  })

  it('a failed send keeps the text and the message; the retry reuses the Idempotency-Key', async () => {
    const { page, office, comments } = await commentPage('owner')
    barButton(page, 'comment').click()
    await page.settle()
    typeInto(q(page, '[data-erp-comments-input="new"]')!, 'Gửi lại nhé')
    office.offline = true
    q(page, '[data-erp-comments-submit="new"]')!.click()
    await page.settle()
    expect(q(page, '[data-erp-comments-composer]')!.textContent).toContain('Không kết nối được máy chủ')
    expect((q(page, '[data-erp-comments-input="new"]') as unknown as { value: string }).value).toBe('Gửi lại nhé')
    const firstKey = office.calls.filter(c => c.method === 'POST' && c.path.endsWith('/comments')).at(-1)!.headers['Idempotency-Key']
    office.offline = false
    q(page, '[data-erp-comments-submit="new"]')!.click()
    await page.settle()
    expect(commentCalls(comments, 'POST')[0].headers['Idempotency-Key']).toBe(firstKey)
    expect(comments.threads).toHaveLength(1)
  })
})

describe('thread actions', () => {
  async function opened(role = 'owner', seed?: (c: FakeComments) => void) {
    const ctx = await commentPage(role, { seed: seed ?? (c => { c.seed(DOC_ID, { anchor: ANCHOR }) }) })
    barButton(ctx.page, 'comments').click()
    await ctx.page.settle()
    return ctx
  }

  it('reply: appended under the thread', async () => {
    const { page, comments } = await opened()
    const id = comments.threads[0].id
    q(page, `[data-erp-thread-reply="${id}"]`)!.click()
    typeInto(q(page, `[data-erp-comments-input="reply:${id}"]`)!, 'Đã kiểm, đúng rồi')
    q(page, `[data-erp-comments-submit="reply:${id}"]`)!.click()
    await page.settle()
    expect(card(page, id).querySelectorAll('[data-erp-comment]').map(n => n.textContent)).toEqual([
      expect.stringContaining('Xem lại số liệu này'), expect.stringContaining('Đã kiểm, đúng rồi'),
    ])
  })

  it('edit and delete only one’s own comment; a deleted root stays as a placeholder while replies remain', async () => {
    const { page, comments } = await opened('commenter', c => {
      c.seed(DOC_ID, { body: 'Của tôi', by: { id: 'usr_an', name: 'Nguyễn Văn An' }, replies: [{ body: 'Của Bình', by: { id: 'usr_binh', name: 'Trần Thị Bình' } }] })
    })
    const thread = comments.threads[0]
    expect(q(page, `[data-erp-comment-edit="${thread.comments[1].id}"]`)).toBeNull()
    q(page, `[data-erp-comment-edit="${thread.comments[0].id}"]`)!.click()
    typeInto(q(page, `[data-erp-comments-input="edit:${thread.comments[0].id}"]`)!, 'Của tôi, đã sửa')
    q(page, `[data-erp-comments-submit="edit:${thread.comments[0].id}"]`)!.click()
    await page.settle()
    expect(card(page, thread.id).textContent).toContain('Của tôi, đã sửa')
    expect(card(page, thread.id).textContent).toContain('đã sửa')
    q(page, `[data-erp-comment-delete="${thread.comments[0].id}"]`)!.click()
    q(page, '[data-erp-comments-confirm-yes]')!.click()
    await page.settle()
    expect(card(page, thread.id).textContent).toContain('Nhận xét này đã bị xoá.')
    expect(card(page, thread.id).textContent).toContain('Của Bình')
  })

  it('resolve moves the thread to "Đã xử lý" (mark gone from open); reopen brings it back', async () => {
    const { page, comments, fork } = await opened()
    const id = comments.threads[0].id
    q(page, '[data-erp-thread-resolve]')!.click()
    await page.settle()
    expect(threadIds(page)).toEqual([])
    expect(q(page, '[data-erp-online-count]')!.hidden).toBe(true)
    expect(fork.shown.at(-1)).toEqual([{ id, anchor: ANCHOR, status: 'resolved', count: 1 }])
    q(page, '[data-erp-comments-filter="resolved"]')!.click()
    expect(threadIds(page)).toEqual([id])
    expect(card(page, id).textContent).toContain('Đã xử lý bởi Nguyễn Văn An')
    q(page, '[data-erp-thread-reopen]')!.click()
    await page.settle()
    q(page, '[data-erp-comments-filter="open"]')!.click()
    expect(threadIds(page)).toEqual([id])
  })

  it('delete thread asks first, then removes it', async () => {
    const { page, comments } = await opened()
    q(page, '[data-erp-thread-delete]')!.click()
    expect(q(page, '[data-erp-comments-confirm]')!.textContent).toContain('Xoá cả chuỗi')
    q(page, '[data-erp-comments-confirm-yes]')!.click()
    await page.settle()
    expect(comments.threads).toEqual([])
    expect(q(page, '[data-erp-comments-empty]')).not.toBeNull()
  })

  it('selecting a placed thread asks the editor to focus its anchor', async () => {
    const { page, comments, fork } = await opened()
    card(page, comments.threads[0].id).click()
    expect(fork.focused).toEqual([[ANCHOR, comments.threads[0].id]])
  })

  it('threads whose place is gone are listed under "Không còn vị trí"', async () => {
    const { page, comments } = await opened('owner', c => {
      c.seed(DOC_ID, { anchor: ANCHOR })
      c.seed(DOC_ID, { anchor: { region: 'para:gone', quote: 'đoạn đã xoá' }, status: 'orphaned' })
    })
    const [placed, orphaned] = comments.threads
    expect(threadIds(page, '[data-erp-comments-open]')).toEqual([placed.id])
    const section = q(page, '[data-erp-comments-orphaned]')!
    expect(section.textContent).toContain('Không còn vị trí')
    expect(threadIds(page, '[data-erp-comments-orphaned]')).toEqual([orphaned.id])
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('2')
  })

  it('the editor’s commentClicked opens the panel on that thread', async () => {
    const { page, comments } = await commentPage('owner', { seed: c => { c.seed(DOC_ID, { anchor: ANCHOR, status: 'resolved' }) } })
    ;(page.host as unknown as { commentClicked(id: string): void }).commentClicked(comments.threads[0].id)
    expect(panel(page).hidden).toBe(false)
    expect(q(page, '[data-erp-comments-filter="resolved"]')!.getAttribute('aria-selected')).toBe('true')
    expect(card(page, comments.threads[0].id).className).toContain('erp-thread--active')
  })

  it('commentClicked leaves the keyboard on the canvas (Word reports clicks inside commented text)', async () => {
    const { page, comments } = await commentPage('owner', { seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) } })
    page.canvas.focus()
    ;(page.host as unknown as { commentClicked(id: string): void }).commentClicked(comments.threads[0].id)
    expect(card(page, comments.threads[0].id).className).toContain('erp-thread--active')
    expect(page.document.activeElement).toBe(page.canvas)
  })
})

describe('deep link ?comment=', () => {
  it('opens the panel on the thread, focuses its anchor once the editor opened, and leaves the URL', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const comments = new FakeComments(office)
    const thread = comments.seed(DOC_ID, { anchor: ANCHOR })
    comments.seed(DOC_ID)
    const { page, fork } = await commentPage('owner', { office, search: `?doc=${DOC_ID}&comment=${thread.id}` })
    await page.settle()
    expect(panel(page).hidden).toBe(false)
    expect(card(page, thread.id).className).toContain('erp-thread--active')
    expect(fork.focused).toEqual([[ANCHOR, thread.id]])
    expect(page.location.search).toBe(`?doc=${DOC_ID}`)
  })

  it('an unknown thread: a notice, no panel', async () => {
    const { page } = await commentPage('owner', { search: `?doc=${DOC_ID}&comment=0b9d6c1e-0000-4000-8000-000000000999` })
    await page.settle()
    expect(page.notices.at(-1)!.text).toBe('Không tìm thấy nhận xét này. Có thể nó đã bị xoá.')
    expect(panel(page).hidden).toBe(true)
  })

  it('a viewer following the link reads the thread', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, 'viewer')
    const comments = new FakeComments(office)
    const thread = comments.seed(DOC_ID, { anchor: ANCHOR })
    const { page, fork } = await commentPage('viewer', { office, search: `?doc=${DOC_ID}&comment=${thread.id}` })
    await page.settle()
    expect(panel(page).hidden).toBe(false)
    expect(card(page, thread.id).className).toContain('erp-thread--active')
    expect(fork.focused).toEqual([[ANCHOR, thread.id]])
    expect(page.location.search).toBe(`?doc=${DOC_ID}`)
  })
})

describe('live refresh', () => {
  const hello = { type: 'hello', v: 1, you: 'm1', mode: 'edit', notice: null, colour: '#1f6feb', seq: 1, leader: 'm1', members: [{ id: 'm1', kind: 'user', name: 'An', colour: '#1f6feb', mode: 'edit', state: 'active' }], limits: {} }
  async function livePage(role = 'owner', options: ForkOptions = {}) {
    const ws = fakeWebSocket()
    const ctx = await commentPage(role, { ...options, WebSocket: ws.WebSocket })
    const socket = ws.sockets[0] as FakeSocket
    socket.accept()
    socket.receive(hello)
    await ctx.page.settle()
    return { ...ctx, ws, socket }
  }

  it('comments.changed with a thread id reads that thread again; a new reply shows without reloading', async () => {
    const { page, comments, socket } = await livePage()
    const thread = comments.seed(DOC_ID, { anchor: ANCHOR })
    socket.receive({ type: 'comments.changed', v: 1, thread_id: thread.id })
    await tick(page, 300)
    expect(commentCalls(comments, 'GET').at(-1)!.path).toBe(`/api/v1/documents/${DOC_ID}/comments/${thread.id}`)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('1')
  })

  it('comments.changed without a thread (several changed) and a rejoin read the whole list', async () => {
    const { page, comments, socket, ws } = await livePage()
    const lists = () => commentCalls(comments, 'GET').filter(c => /\/comments\?/.test(c.path)).length
    const before = lists()
    comments.seed(DOC_ID)
    socket.receive({ type: 'comments.changed', v: 1, thread_id: null })
    await tick(page, 300)
    expect(lists()).toBe(before + 1)
    socket.drop(1006)
    await tick(page, 60 * 1000)
    // Without a room the 30 s check reads them meanwhile.
    const offline = lists()
    expect(offline).toBeGreaterThan(before + 1)
    const next = ws.sockets.at(-1) as FakeSocket
    next.accept()
    next.receive(hello)
    await page.settle()
    expect(lists()).toBe(offline + 1)
  })

  it('a viewer in the room follows comments.changed too', async () => {
    const { page, comments, socket } = await livePage('viewer')
    const thread = comments.seed(DOC_ID, { anchor: ANCHOR })
    socket.receive({ type: 'comments.changed', v: 1, thread_id: thread.id })
    await tick(page, 300)
    expect(commentCalls(comments, 'GET').at(-1)!.path).toBe(`/api/v1/documents/${DOC_ID}/comments/${thread.id}`)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('1')
  })

  it('a thread deleted elsewhere disappears on its comments.changed (404)', async () => {
    const { page, comments, socket } = await livePage('owner')
    const thread = comments.seed(DOC_ID)
    socket.receive({ type: 'comments.changed', v: 1, thread_id: null })
    await tick(page, 300)
    barButton(page, 'comments').click()
    expect(threadIds(page)).toEqual([thread.id])
    comments.threads = []
    socket.receive({ type: 'comments.changed', v: 1, thread_id: thread.id })
    await tick(page, 300)
    expect(threadIds(page)).toEqual([])
  })
})

describe('placing anchors again (resolveAnchors)', () => {
  it('after the editor opened the content, the page alone in the room sends what moved as one PATCH', async () => {
    const { page, comments, fork } = await commentPage('owner', {
      seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }); c.seed(DOC_ID, { anchor: { region: 'para:x', quote: 'cũ' } }); c.seed(DOC_ID) },
      resolve: threads => [
        { threadId: threads[0].id, anchor: { ...ANCHOR, order: [4, 10] } },
        { threadId: threads[1].id, status: 'orphaned' },
      ],
    })
    await tick(page, 2000)
    expect(fork.resolved).toHaveLength(1)
    expect(fork.resolved[0]).toHaveLength(2)
    const patch = commentCalls(comments, 'PATCH')
    expect(patch).toHaveLength(1)
    expect(JSON.parse(patch[0].body as string).updates).toEqual([
      { thread_id: comments.threads[0].id, anchor: { ...ANCHOR, order: [4, 10] }, region: 'para:1a2b3c' },
      { thread_id: comments.threads[1].id, status: 'orphaned' },
    ])
    barButton(page, 'comments').click()
    expect(threadIds(page, '[data-erp-comments-orphaned]')).toEqual([comments.threads[1].id])
  })

  it('nothing moved: no PATCH', async () => {
    const { page, comments, fork } = await commentPage('owner', { seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) } })
    await tick(page, 2000)
    expect(fork.resolved).toHaveLength(1)
    expect(commentCalls(comments, 'PATCH')).toEqual([])
  })

  it('the forks’ shape: every thread back as { id, anchor, status } a frame later, keys reordered, one left out; only the moved one is sent', async () => {
    const kept = { v: 1, region: 'annot:1', pos: { page: 0, quads: [1, 2, 3, 4] }, soft: { text: 'cũ' }, label: 'Trang 1' }
    const moved = { v: 1, region: 'annot:2', pos: { page: 1 }, soft: { text: 'mới' }, label: 'Trang 2' }
    const { page, comments, fork } = await commentPage('owner', {
      seed: c => { c.seed(DOC_ID, { anchor: kept, replies: [{ body: 'Một' }] }); c.seed(DOC_ID, { anchor: moved }); c.seed(DOC_ID, { anchor: { v: 2, x: 1 } }) },
      resolve: threads => new Promise(done => setTimeout(() => done([
        { id: threads[0].id, anchor: { label: 'Trang 1', soft: { text: 'cũ' }, pos: { quads: [1, 2, 3, 4], page: 0 }, region: 'annot:1', v: 1 }, status: 'open' },
        { id: threads[1].id, anchor: { ...moved, pos: { page: 2 }, label: 'Trang 3' }, status: 'open' },
      ]), 16)) as never,
    })
    expect(fork.shown.at(-1)).toEqual([
      { id: comments.threads[0].id, anchor: kept, status: 'open', count: 2 },
      { id: comments.threads[1].id, anchor: moved, status: 'open', count: 1 },
      { id: comments.threads[2].id, anchor: { v: 2, x: 1 }, status: 'open', count: 1 },
    ])
    await tick(page, 2000)
    // The fork answers on a later frame (a real timer here, outside the page's clock).
    await new Promise(done => setTimeout(done, 40))
    await page.settle()
    expect(JSON.parse(commentCalls(comments, 'PATCH')[0].body as string).updates).toEqual([
      { thread_id: comments.threads[1].id, anchor: { ...moved, pos: { page: 2 }, label: 'Trang 3' }, region: 'annot:2' },
    ])
    barButton(page, 'comments').click()
    expect(card(page, comments.threads[1].id).textContent).toContain('Trang 3')
  })

  it('in a room led by someone else the page leaves it to the leader', async () => {
    const ws = fakeWebSocket()
    const { page, fork } = await commentPage('owner', { WebSocket: ws.WebSocket, seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) } })
    const socket = ws.sockets[0] as FakeSocket
    socket.accept()
    socket.receive({ type: 'hello', v: 1, you: 'm2', mode: 'edit', notice: null, colour: '#1f6feb', seq: 1, leader: 'm1', members: [], limits: {} })
    await tick(page, 2000)
    expect(fork.resolved).toEqual([])
  })
})

describe('load on the server and stale rights (M6 review)', () => {
  const hello = (mode = 'edit') => ({ type: 'hello', v: 1, you: 'm1', mode, notice: null, colour: '#1f6feb', seq: 1, leader: 'm1', members: [{ id: 'm1', kind: 'user', name: 'An', colour: '#1f6feb', mode, state: 'active' }], limits: {} })
  async function livePage(role = 'owner', options: ForkOptions & { seed?: (c: FakeComments) => void; office?: FakeOffice } = {}) {
    const ws = fakeWebSocket()
    const ctx = await commentPage(role, { ...options, WebSocket: ws.WebSocket })
    const socket = ws.sockets[0] as FakeSocket
    socket.accept()
    socket.receive(hello())
    await ctx.page.settle()
    return { ...ctx, ws, socket }
  }

  it('a storm of comments.changed (anchor patches while someone types) reads the whole list at most every 5 s', async () => {
    const { page, comments, socket } = await livePage()
    const lists = () => commentCalls(comments, 'GET').filter(c => /\/comments\?/.test(c.path)).length
    const before = lists()
    for (let i = 0; i < 4; i++) {
      socket.receive({ type: 'comments.changed', v: 1, thread_id: null })
      await tick(page, 1000)
    }
    expect(lists()).toBe(before + 1)
    await tick(page, 2000)
    // The last change is never lost: one trailing read once the gap is over.
    expect(lists()).toBe(before + 2)
  })

  it('a failed anchor PATCH does not read the list again at once', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, 'owner')
    // Registered before the fake comment routes, so it answers every PATCH first.
    office.on(call => (call.method === 'PATCH' ? problem(429, 'RATE_LIMITED', { message_vi: 'x', request_id: 'r', retryable: true }) : undefined), false)
    let turn = 0
    const { page, comments } = await livePage('owner', {
      office,
      seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) },
      resolve: threads => [{ id: threads[0].id, anchor: { ...ANCHOR, order: [9, ++turn] }, status: 'open' }],
    })
    const lists = () => commentCalls(comments, 'GET').filter(c => /\/comments\?/.test(c.path)).length
    await tick(page, 2000)
    const before = lists()
    for (let i = 0; i < 3; i++) {
      page.host!.opened(DOC_ID, true)
      await tick(page, 1600)
    }
    expect(office.calls.filter(c => c.method === 'PATCH').length).toBeGreaterThanOrEqual(2)
    expect(lists() - before).toBeLessThanOrEqual(1)
  })

  it('an anchor over 8 KiB in UTF-8 (short in UTF-16) is refused before any request', async () => {
    const label = 'Ồ'.repeat(3000)
    const { page, comments } = await commentPage('owner', { anchor: () => ({ v: 1, region: 'para:1', label }) })
    barButton(page, 'comment').click()
    await page.settle()
    expect(page.notices.at(-1)?.text).toBe('Không gắn được nhận xét vào chỗ này. Hãy chọn đoạn ngắn hơn.')
    expect(panel(page).hidden).toBe(true)
    expect(commentCalls(comments, 'POST')).toEqual([])
  })

  it('an editor turned commenter in the room loses "Đánh dấu đã xử lý" at once', async () => {
    const { page, office, socket } = await livePage('editor', { seed: c => { c.seed(DOC_ID, { anchor: ANCHOR }) } })
    barButton(page, 'comments').click()
    await page.settle()
    expect(q(page, '[data-erp-thread-resolve]')).not.toBeNull()
    office.setRole(DOC_ID, 'commenter')
    socket.receive({ type: 'mode', v: 1, mode: 'comment' })
    await tick(page, 1000)
    expect(q(page, '[data-erp-mode]')?.textContent).toBe('Chỉ nhận xét')
    expect(q(page, '[data-erp-thread-resolve]')).toBeNull()
    expect(q(page, '[data-erp-thread-delete]')).toBeNull()
  })
})

describe('the public link page reads comments', () => {
  const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
  const hello = { type: 'hello', v: 1, you: 'm2', mode: 'view', notice: null, colour: '#1f6feb', seq: 1, leader: null, members: [], limits: {} }
  async function linkCommentPage(options: { search?: string; WebSocket?: unknown; seed?: (c: FakeComments) => void } = {}) {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.links.set(TOKEN, DOC_ID)
    const comments = new FakeComments(office)
    options.seed?.(comments)
    const page = onlinePage({ office, search: options.search ?? '', hash: `#link=${TOKEN}`, account: { status: 'signed-out', sub: '' }, WebSocket: options.WebSocket } as PageOptions)
    await page.settle()
    const fork = commentFork(page)
    await page.settle()
    return { page, office, comments, fork }
  }
  const commentLinkCalls = (office: FakeOffice) => office.linkCalls.filter(c => c.path.includes('/comments'))

  it('anonymous and read-only: threads and marks, no name, no button that writes; GETs with the token only', async () => {
    const { page, office, comments, fork } = await linkCommentPage({
      seed: c => { c.seed(DOC_ID, { anchor: ANCHOR, replies: [{ body: 'Đã sửa' }] }); c.seed(DOC_ID, { status: 'orphaned' }) },
    })
    expect(barButton(page, 'comment').hidden).toBe(true)
    expect(barButton(page, 'comments').hidden).toBe(false)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('2')
    barButton(page, 'comments').click()
    await page.settle()
    expect(threadIds(page, '[data-erp-comments-open]')).toEqual([comments.threads[0].id])
    expect(threadIds(page, '[data-erp-comments-orphaned]')).toEqual([comments.threads[1].id])
    const text = card(page, comments.threads[0].id).textContent
    expect(text).toContain('Đã sửa')
    expect(text).not.toContain('Trần Thị Bình')
    expect(text).toContain('Người dùng')
    expect(fork.shown.at(-1)).toHaveLength(1)
    for (const selector of ['[data-erp-comments-add]:not([hidden])', '[data-erp-thread-reply]', '[data-erp-thread-resolve]', '[data-erp-thread-delete]', '[data-erp-comment-edit]']) {
      expect(q(page, selector), selector).toBeNull()
    }
    expect(q(page, '[data-erp-comments-readonly]')!.hidden).toBe(false)
    expect(office.calls).toEqual([])
    expect(commentLinkCalls(office).length).toBeGreaterThan(0)
    for (const call of commentLinkCalls(office)) {
      expect(call.init).toMatchObject({ method: 'GET', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
      const headers = new Headers(call.init.headers)
      expect(headers.get('X-Link-Token')).toBe(TOKEN)
      expect(headers.get('Authorization')).toBeNull()
      expect(call.path).not.toContain(TOKEN)
    }
    ;(page.host as unknown as { commentClicked(id: string): void }).commentClicked(comments.threads[0].id)
    expect(card(page, comments.threads[0].id).className).toContain('erp-thread--active')
  })

  it('the link API refuses anything but a comment read', async () => {
    const { page, office } = await linkCommentPage()
    const linkApi = (onlineApi(page).createLinkApi as (f: unknown) => { commentsFetch(t: string): (p: string, i?: RequestInit) => Promise<Response> })(office.linkFetch)
    const read = linkApi.commentsFetch(TOKEN)
    expect(() => read(`/api/v1/documents/${DOC_ID}/comments`, { method: 'POST' })).toThrow('invalid_api_path')
    expect(() => read(`/api/v1/documents/${DOC_ID}/content`)).toThrow('invalid_api_path')
    expect(() => linkApi.commentsFetch('short')(`/api/v1/documents/${DOC_ID}/comments`)).toThrow('invalid_api_path')
    office.offline = true
    await expect(read(`/api/v1/documents/${DOC_ID}/comments?limit=50`)).rejects.toMatchObject({ code: 'network' })
  })

  it('follows comments.changed in the room, and the 30 s check without one', async () => {
    const ws = fakeWebSocket()
    const { page, office, comments } = await linkCommentPage({ WebSocket: ws.WebSocket })
    const socket = ws.sockets[0] as FakeSocket
    socket.accept()
    socket.receive(hello)
    await page.settle()
    const thread = comments.seed(DOC_ID, { anchor: ANCHOR })
    socket.receive({ type: 'comments.changed', v: 1, thread_id: thread.id })
    await tick(page, 300)
    expect(commentLinkCalls(office).at(-1)!.path).toBe(`/api/v1/documents/${DOC_ID}/comments/${thread.id}`)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('1')
    socket.drop(1006)
    comments.seed(DOC_ID)
    await tick(page, 31 * 1000)
    expect(q(page, '[data-erp-online-count]')!.textContent).toBe('2')
  })

  it('?comment= opens the panel on the thread and leaves the token in place', async () => {
    const seeded: string[] = []
    const { page } = await linkCommentPage({
      search: '?comment=c0aaaaaa-0000-4000-8000-000000000001',
      seed: c => { seeded.push(c.seed(DOC_ID, { anchor: ANCHOR }).id) },
    })
    expect(seeded[0]).toBe('c0aaaaaa-0000-4000-8000-000000000001')
    expect(panel(page).hidden).toBe(false)
    expect(card(page, seeded[0]).className).toContain('erp-thread--active')
    expect(page.location.search).toBe('')
    expect(page.location.hash).toBe(`#link=${TOKEN}`)
  })

  it('a link turned off: the comments go with the document', async () => {
    const { page, office } = await linkCommentPage({ seed: c => { c.seed(DOC_ID) } })
    expect(barButton(page, 'comments').hidden).toBe(false)
    office.links.delete(TOKEN)
    await tick(page, 31 * 1000)
    expect(page.dialogId()).toBe('gone')
    expect(barButton(page, 'comments').hidden).toBe(true)
  })
})
