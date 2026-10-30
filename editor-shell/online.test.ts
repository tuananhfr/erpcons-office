import { describe, expect, it } from 'vitest'
import { FakeEvent, actionLabels, buttonNamed } from './fake-dom.ts'
import { FakeIdb } from './fake-idb.ts'
import { DOC_ID, FakeOffice, OTHER_ID, problem } from './fake-office.ts'
import { flush, onlinePage, type PageOptions } from './online-harness.ts'

const NOT_FOUND = 'Không tìm thấy tài liệu hoặc bạn không có quyền mở'
const bytes = (...values: number[]) => new Uint8Array(values)
const list = (data: Uint8Array) => [...data]

type Page = ReturnType<typeof onlinePage>

async function opened(options: PageOptions = {}) {
  const page = onlinePage(options)
  page.fork()
  await page.settle()
  return page
}
async function tick(page: Page, ms: number) {
  await flush()
  page.clock.advance(ms)
  await page.settle()
}
function click(page: Page, label: string) {
  buttonNamed(page.dialog()!, label).click()
}
function badge(page: Page) {
  const node = page.badge()!
  const full = node.querySelector('.erp-shell__draft-full')!
  // Visible order: the state, then the document name (shell.css draws the " · " between them).
  const text = full.children.map(part => part.textContent).join(' · ')
  return { state: node.getAttribute('data-erp-save-state'), text, label: node.getAttribute('aria-label'), tooltip: node.title, short: node.querySelector('.erp-shell__draft-short')!.textContent, hidden: node.hidden, role: node.getAttribute('role') }
}
function pendingRows(idb: FakeIdb) { return idb.rows('pending') }

describe('activation', () => {
  it('installs a frozen erpHost v2 for a signed-in user on /<editor>/?doc=<id>', () => {
    const page = onlinePage()
    expect(page.host?.version).toBe(2)
    expect(Object.isFrozen(page.host)).toBe(true)
    expect(Object.keys(page.host!).sort()).toEqual(['closed', 'dirty', 'opened', 'ready', 'save', 'version'])
  })

  it.each([
    ['no ?doc', { search: '' }],
    ['the landing', { pathname: '/' }],
    ['a page under an editor', { pathname: '/van-ban/khac/' }],
    ['the ERP embed', { search: `?doc=${DOC_ID}&embed=erpcons&parent=https%3A%2F%2Flpc.vn` }],
    ['a host=parent frame', { search: `?doc=${DOC_ID}&host=parent` }],
    ['PI sign-in off', { account: { status: 'disabled' as const, sub: '' } }],
  ])('stays out of the way on %s: no erpHost, no request, no UI', async (_name, options) => {
    const page = onlinePage(options)
    await page.settle()
    expect(page.host).toBeUndefined()
    expect(page.office.calls).toEqual([])
    expect(page.dialog()).toBeNull()
    expect(page.badge()).toBeNull()
  })

  it('signed out: asks to sign in without erpHost, and reloads once signed in', async () => {
    const page = onlinePage({ account: { status: 'signed-out', sub: 'usr_an' } })
    expect(page.host).toBeUndefined()
    expect(page.dialogId()).toBe('sign-in')
    click(page, 'Đăng nhập')
    expect(page.account.signIns).toBe(1)
    page.account.set('signed-in')
    expect(page.location.reloads).toBe(1)
    expect(page.dialog()).toBeNull()
    expect(page.office.calls).toEqual([])
  })

  it('an id that is not a document id gets the not-found message and no request', async () => {
    const page = onlinePage({ search: '?doc=../../me' })
    await page.settle()
    expect(page.host).toBeUndefined()
    expect(page.dialog()?.textContent).toContain(NOT_FOUND)
    expect(page.office.calls).toEqual([])
  })
})

describe('opening', () => {
  it('fetches metadata and bytes, then opens them once the editor is ready', async () => {
    const page = onlinePage()
    await page.settle()
    expect(page.opened).toEqual([])
    page.fork()
    expect(page.opened).toHaveLength(1)
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, version: 1, title: 'Báo cáo quý', format: 'docx' })
    expect(list(page.opened[0].bytes)).toEqual([1, 2, 3])
    expect(badge(page)).toMatchObject({ state: 'SERVER_DURABLE', text: 'Đã lưu · Báo cáo quý', hidden: false })
  })

  it.each([
    ['metadata', (path: string) => !path.endsWith('/content')],
    ['content', (path: string) => path.endsWith('/content')],
  ])('a 404 on the %s says only that it is not found or not allowed', async (_name, which) => {
    const office = new FakeOffice().add(DOC_ID, 'Bí mật', 'docx', bytes(1))
    office.on(call => (which(call.path) ? problem(404, 'NOT_FOUND', { message_vi: 'Tài liệu đã bị xoá' }) : undefined))
    const page = await opened({ office })
    expect(page.dialog()?.querySelector('h2')?.textContent).toBe(NOT_FOUND)
    expect(page.dialog()?.textContent).not.toContain('Bí mật')
    expect(page.dialog()?.textContent).not.toContain('xoá')
    expect(page.opened).toEqual([])
    expect(actionLabels(page.dialog()!)).toEqual(['Về trang chủ', 'Đóng'])
  })

  it('an unreachable server says so and opens after "Thử lại"', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    office.offline = true
    const page = await opened({ office })
    expect(page.dialog()?.querySelector('h2')?.textContent).toBe('Không kết nối được máy chủ')
    office.offline = false
    click(page, 'Thử lại')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(page.opened).toHaveLength(1)
  })

  it('an expired session asks to sign in and then opens', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    office.rejections.push('unauthenticated')
    const page = onlinePage({ office })
    page.fork()
    await page.settle()
    expect(page.dialogId()).toBe('sign-in')
    click(page, 'Đăng nhập')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(page.opened).toHaveLength(1)
  })

  it('an editor that refuses the document gets the intake message, and the document is no longer tracked', async () => {
    const page = await opened()
    page.host!.opened(DOC_ID, false, 'unsupported')
    expect(page.notices).toEqual([{ text: 'Không mở được “Báo cáo quý” trong công cụ này. [unsupported]', role: 'alert' }])
    expect((await page.host!.save(DOC_ID, bytes(1), { revision: 1, reason: 'auto' })).status).toBe('failed')
  })
})

describe('opened(false) reason', () => {
  it.each([
    ['unsupported', ' [unsupported]'],
    ['parserFailed', ' [parserFailed]'],
    ['tooLarge', ' [parserFailed]'],
    ['storageError', ' [parserFailed]'],
    ['toString', ' [parserFailed]'],
    [42, ' [parserFailed]'],
    [undefined, ''],
  ])('%s → the matching intake sentence; any other key reads as parserFailed', async (reason, why) => {
    const page = await opened()
    page.host!.opened(DOC_ID, false, reason as string | undefined)
    expect(page.notices).toEqual([{ text: `Không mở được “Báo cáo quý” trong công cụ này.${why}`, role: 'alert' }])
  })
})

describe('save → SaveResult (docs/erp-host.md table)', () => {
  it('200 → saved with the new version; the next save is based on it', async () => {
    const page = await opened()
    page.host!.dirty(DOC_ID, true)
    await page.settle()
    expect(badge(page).state).toBe('LOCAL_ONLY')
    expect(badge(page)).toMatchObject({ text: 'Chưa lưu lên máy chủ · Báo cáo quý', label: 'Báo cáo quý: Chưa lưu lên máy chủ', tooltip: 'Báo cáo quý: Chưa lưu lên máy chủ', short: 'Chưa lưu' })
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'saved', version: 2 })
    page.host!.dirty(DOC_ID, false)
    await page.settle()
    expect(badge(page).state).toBe('SERVER_DURABLE')
    expect(await page.host!.save(DOC_ID, bytes(8), { revision: 3, reason: 'manual' })).toEqual({ status: 'saved', version: 3 })
    expect(page.office.puts().map(c => c.headers['If-Match'])).toEqual([page.office.etag(DOC_ID, 1), page.office.etag(DOC_ID, 2)])
    expect(list(page.office.latest(DOC_ID))).toEqual([8])
  })

  it('shows "Đang lưu…" while the request is in flight', async () => {
    const page = await opened()
    const release = page.office.holdNextPut()
    const saving = page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    await page.settle()
    expect(badge(page)).toMatchObject({ state: 'SAVING', text: 'Đang lưu… · Báo cáo quý', role: 'status' })
    release()
    expect(await saving).toEqual({ status: 'saved', version: 2 })
  })

  it('copies the bytes: the editor may reuse its memory once save returns', async () => {
    const page = await opened()
    const memory = new Uint8Array([0, 5, 6, 0])
    const saving = page.host!.save(DOC_ID, memory.subarray(1, 3), { revision: 2, reason: 'auto' })
    memory.fill(9)
    await saving
    expect(list(page.office.latest(DOC_ID))).toEqual([5, 6])
  })

  it('409 VERSION_CONFLICT → conflict with latestVersion; nothing is written and the dialog opens', async () => {
    const page = await opened()
    page.office.saveElsewhere(DOC_ID, bytes(4))
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'conflict', latestVersion: 2 })
    expect(page.office.version(DOC_ID)).toBe(2)
    expect(list(page.office.latest(DOC_ID))).toEqual([4])
    await page.settle()
    expect(page.dialog()?.querySelector('h2')?.textContent).toBe('Tài liệu đã được lưu ở nơi khác')
    expect(actionLabels(page.dialog()!)).toEqual(['Lưu bản của tôi thành bản sao', 'Mở bản mới nhất'])
    expect(badge(page)).toMatchObject({ state: 'ERROR', role: 'alert', text: 'Tài liệu đã được lưu ở nơi khác · Báo cáo quý', label: 'Báo cáo quý: Tài liệu đã được lưu ở nơi khác' })
    // A flush during the conflict does not send anything either.
    expect(await page.host!.save(DOC_ID, bytes(8), { revision: 3, reason: 'flush' })).toEqual({ status: 'conflict', latestVersion: 2 })
    expect(page.office.puts()).toHaveLength(1)
  })

  it('network error → offline at once, kept and retried with backoff until it lands', async () => {
    const page = await opened({ random: 0 })
    page.office.offline = true
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'offline' })
    await page.settle()
    expect(badge(page)).toMatchObject({ state: 'LOCAL_ONLY', text: 'Chưa lưu lên máy chủ · Không kết nối được máy chủ · Báo cáo quý' })
    expect(page.office.puts()).toHaveLength(1)
    await tick(page, 500)
    expect(page.office.puts()).toHaveLength(2)
    await tick(page, 999)
    expect(page.office.puts()).toHaveLength(2)
    page.office.offline = false
    await tick(page, 1)
    expect(page.office.puts()).toHaveLength(3)
    expect(list(page.office.latest(DOC_ID))).toEqual([7])
    expect(pendingRows(page.idb)).toEqual([])
  })

  it('the browser coming back online retries at once', async () => {
    const page = await opened()
    page.office.offline = true
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(page.office.version(DOC_ID)).toBe(2)
  })

  it.each([413, 422])('%i → failed, not retryable, with the server message; no retry', async (status) => {
    const page = await opened()
    page.office.on(call => (call.method === 'PUT' ? problem(status, status === 413 ? 'QUOTA_EXCEEDED' : 'INVALID_SIGNATURE') : undefined))
    const result = await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'manual' })
    expect(result).toEqual({ status: 'failed', retryable: false, message: status === 413 ? 'Lỗi QUOTA_EXCEEDED' : 'Lỗi INVALID_SIGNATURE' })
    await tick(page, 10 * 60 * 1000)
    expect(page.office.puts()).toHaveLength(1)
    expect(badge(page)).toMatchObject({ state: 'ERROR', text: `${result.message} · Báo cáo quý`, label: `Báo cáo quý: ${result.message}`, tooltip: `Báo cáo quý: ${result.message}` })
  })

  it.each([429, 503])('%i → three quick tries, then failed and retryable; the shell keeps retrying', async (status) => {
    const page = await opened()
    page.office.on(call => (call.method === 'PUT' ? problem(status, status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE') : undefined), false)
    let result: unknown = null
    void page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' }).then(r => { result = r })
    await page.settle()
    expect(page.office.puts()).toHaveLength(1)
    await tick(page, 750)
    expect(page.office.puts()).toHaveLength(2)
    expect(result).toBeNull()
    await tick(page, 1500)
    expect(page.office.puts()).toHaveLength(3)
    expect(result).toEqual({ status: 'failed', retryable: true, message: status === 429 ? 'Lỗi RATE_LIMITED' : 'Lỗi UNAVAILABLE' })
    await tick(page, 750)
    expect(page.office.puts()).toHaveLength(4)
  })

  it('429 Retry-After is honoured, and a long one goes straight to the background retry', async () => {
    const page = await opened()
    page.office.on(call => (call.method === 'PUT' ? problem(429, 'RATE_LIMITED', {}, { 'Retry-After': '30' }) : undefined))
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toMatchObject({ status: 'failed', retryable: true })
    expect(page.office.puts()).toHaveLength(1)
    await tick(page, 29_000)
    expect(page.office.puts()).toHaveLength(1)
    await tick(page, 1_000)
    expect(page.office.puts()).toHaveLength(2)
    expect(page.office.version(DOC_ID)).toBe(2)
  })

  it('503 then 200 inside the quick tries → saved', async () => {
    const page = await opened()
    page.office.on(call => (call.method === 'PUT' ? problem(503, 'UNAVAILABLE', {}, { 'Retry-After': '2' }) : undefined))
    const saving = page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    await tick(page, 2000)
    expect(await saving).toEqual({ status: 'saved', version: 2 })
  })

  it('401 after the refresh → failed and retryable; saved once the user signs in again', async () => {
    const page = await opened()
    page.office.rejections.push('unauthenticated')
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'failed', retryable: true, message: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để lưu lên máy chủ.' })
    await tick(page, 10 * 60 * 1000)
    expect(page.office.puts()).toHaveLength(1)
    page.account.set('signed-out')
    page.account.set('signed-in')
    await page.settle()
    expect(page.office.version(DOC_ID)).toBe(2)
  })

  it('a save for a document that is not open fails without a request', async () => {
    const page = await opened()
    expect(await page.host!.save(OTHER_ID, bytes(7), { revision: 1, reason: 'auto' })).toMatchObject({ status: 'failed', retryable: false })
    page.host!.closed(DOC_ID)
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toMatchObject({ status: 'failed', retryable: false })
    expect(page.office.puts()).toEqual([])
  })
})

describe('acknowledged (the shell retry stored the bytes)', () => {
  // A fork as docs/erp-host.md asks: an acknowledged revision at or past its newest one makes it clean.
  async function ackingFork(options: PageOptions = {}) {
    const page = onlinePage(options)
    const fork = { revision: 2 }
    page.fork(undefined, (docId, revision) => { if (revision >= fork.revision) page.host!.dirty(docId, false) })
    await page.settle()
    return { page, fork }
  }

  it('after offline: the background retry that lands calls acknowledged with that revision, and the badge reads "Đã lưu"', async () => {
    const { page } = await ackingFork({ random: 0 })
    page.office.offline = true
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'offline' })
    await page.settle()
    expect(page.acks).toEqual([])
    expect(badge(page).state).toBe('LOCAL_ONLY')
    page.office.offline = false
    await tick(page, 500)
    expect(page.office.version(DOC_ID)).toBe(2)
    expect(page.acks).toEqual([{ docId: DOC_ID, revision: 2, version: 2 }])
    expect(badge(page)).toMatchObject({ state: 'SERVER_DURABLE', text: 'Đã lưu · Báo cáo quý' })
  })

  it('after a retryable failure: acknowledged once the shell retry is stored', async () => {
    const { page } = await ackingFork()
    let fail = true
    page.office.on(call => (call.method === 'PUT' && fail ? problem(503, 'UNAVAILABLE', {}, { 'Retry-After': '30' }) : undefined), false)
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 5, reason: 'manual' })).toMatchObject({ status: 'failed', retryable: true })
    fail = false
    await tick(page, 30_000)
    expect(page.acks).toEqual([{ docId: DOC_ID, revision: 5, version: 2 }])
    expect(badge(page).state).toBe('SERVER_DURABLE')
  })

  it('after signing in again: the resumed save is acknowledged', async () => {
    const { page } = await ackingFork()
    page.office.rejections.push('unauthenticated')
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    page.account.set('signed-out')
    page.account.set('signed-in')
    await page.settle()
    expect(page.acks).toEqual([{ docId: DOC_ID, revision: 2, version: 2 }])
  })

  it('a fork that edited since keeps its newer revision dirty: the badge stays "Chưa lưu lên máy chủ"', async () => {
    const { page, fork } = await ackingFork()
    page.office.offline = true
    page.host!.dirty(DOC_ID, true)
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    fork.revision = 3
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(page.acks).toEqual([{ docId: DOC_ID, revision: 2, version: 2 }])
    expect(badge(page).state).toBe('LOCAL_ONLY')
  })

  it('never doubles a direct answer: saved, or a save the editor is still waiting on, is not acknowledged too', async () => {
    const { page } = await ackingFork()
    expect(await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })).toEqual({ status: 'saved', version: 2 })
    const release = page.office.holdNextPut()
    const second = page.host!.save(DOC_ID, bytes(8), { revision: 3, reason: 'auto' })
    await page.settle()
    // The resumed retry queues ahead of the next save and sends its bytes while the editor still waits on them.
    page.fire('online')
    const third = page.host!.save(DOC_ID, bytes(9), { revision: 4, reason: 'auto' })
    release()
    expect(await second).toEqual({ status: 'saved', version: 3 })
    expect(await third).toEqual({ status: 'saved', version: 4 })
    await page.settle()
    expect(list(page.office.latest(DOC_ID))).toEqual([9])
    expect(page.acks).toEqual([])
  })

  it('bytes recovered from the pending store after a reload are not acknowledged', async () => {
    const idb = new FakeIdb()
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const first = await opened({ idb, office })
    office.offline = true
    await first.host!.save(DOC_ID, bytes(7, 7), { revision: 2, reason: 'auto' })
    await first.settle()
    const { page } = await ackingFork({ idb, office })
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    office.offline = false
    page.fire('online')
    await page.settle()
    expect(office.version(DOC_ID)).toBe(2)
    expect(page.acks).toEqual([])
  })

  it('no acknowledged for a document the editor closed', async () => {
    const { page } = await ackingFork()
    page.office.offline = true
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    page.host!.closed(DOC_ID)
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(page.office.version(DOC_ID)).toBe(2)
    expect(page.acks).toEqual([])
  })

  it.each([
    ['without acknowledged', null],
    ['whose acknowledged throws', () => { throw new Error('boom') }],
  ])('an editor %s still gets its bytes stored', async (_name, handler) => {
    const page = onlinePage()
    page.fork(undefined, handler)
    await page.settle()
    page.office.offline = true
    page.host!.dirty(DOC_ID, true)
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(page.office.version(DOC_ID)).toBe(2)
    expect(pendingRows(page.idb)).toEqual([])
    // Still dirty in the editor: the badge does not claim "Đã lưu" for edits the editor may still hold.
    expect(badge(page).state).toBe('LOCAL_ONLY')
    expect(page.logs).toEqual(handler ? [['erpHost acknowledged handler failed']] : [])
  })
})

describe('another account signs in on the same page', () => {
  const OTHER_ACCOUNT = 'Bạn đang đăng nhập bằng tài khoản khác'
  // An unacknowledged copy of usr_an's edits, then the session ends and usr_binh signs in through the popup.
  async function switched(direct = false) {
    const page = await opened()
    page.office.offline = true
    page.host!.dirty(DOC_ID, true)
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    await page.settle()
    page.office.offline = false
    if (!direct) page.account.set('signed-out')
    page.account.set('signed-in', 'usr_binh')
    await page.settle()
    return { page, sent: page.office.calls.length }
  }

  it.each([['after a sign-out', false], ['directly', true]])('%s: nothing is sent with the new account, the copy stays the first account\'s, and the page asks for a reload', async (_name, direct) => {
    const { page, sent } = await switched(direct)
    expect(page.dialogId()).toBe('other-account')
    expect(page.dialog()?.querySelector('h2')?.textContent).toBe(OTHER_ACCOUNT)
    expect(page.dialog()?.textContent).toContain('vẫn được giữ trên thiết bị này')
    expect(actionLabels(page.dialog()!)).toEqual(['Tải lại trang'])
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({ sub: 'usr_an', size: 1 })])

    // The editor keeps saving: offline (it stays dirty), stored under the first account, never sent.
    expect(await page.host!.save(DOC_ID, bytes(8, 8), { revision: 3, reason: 'auto' })).toEqual({ status: 'offline' })
    await page.settle()
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({ sub: 'usr_an', size: 2 })])
    expect(badge(page)).toMatchObject({ state: 'LOCAL_ONLY', text: `Chưa lưu lên máy chủ · ${OTHER_ACCOUNT}. Hãy tải lại trang. · Báo cáo quý` })
    page.fire('online')
    await tick(page, 10 * 60 * 1000)
    await page.online.flush()
    expect(page.office.calls).toHaveLength(sent)
    expect(page.office.version(DOC_ID)).toBe(1)
    expect(page.acks).toEqual([])

    click(page, 'Tải lại trang')
    expect(page.location.reloads).toBe(1)
  })

  it('the first account signing in again closes the dialog and resumes as before', async () => {
    const { page } = await switched()
    page.account.set('signed-out')
    page.account.set('signed-in', 'usr_an')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(page.office.version(DOC_ID)).toBe(2)
    expect(page.acks).toEqual([{ docId: DOC_ID, revision: 2, version: 2 }])
    expect(pendingRows(page.idb)).toEqual([])
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 3, reason: 'auto' })).toEqual({ status: 'saved', version: 3 })
  })

  it('a conflict open at the switch: neither way out sends anything with the new account', async () => {
    const page = await opened()
    page.office.saveElsewhere(DOC_ID, bytes(4))
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    await page.settle()
    expect(page.dialogId()).toBe('conflict')
    const conflict = page.dialog()!
    const sent = page.office.calls.length
    page.account.set('signed-in', 'usr_binh')
    await page.settle()
    expect(page.dialogId()).toBe('other-account')
    // A click that was already on its way to the replaced dialog.
    buttonNamed(conflict, 'Lưu bản của tôi thành bản sao').click()
    buttonNamed(conflict, 'Mở bản mới nhất').click()
    await page.settle()
    expect(page.office.calls).toHaveLength(sent)
    expect(page.office.docs.size).toBe(1)
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({ sub: 'usr_an' })])
  })

  it('an open retried after signing in as someone else sends nothing', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1))
    office.rejections.push('unauthenticated')
    const page = onlinePage({ office })
    page.fork()
    await page.settle()
    expect(page.dialogId()).toBe('sign-in')
    const sent = office.calls.length
    page.account.state.sub = 'usr_binh'
    click(page, 'Đăng nhập')
    await page.settle()
    expect(office.calls).toHaveLength(sent)
    expect(page.opened).toEqual([])
  })
})

describe('pending store', () => {
  it('holds the bytes with their base until the server acknowledges them', async () => {
    const page = await opened()
    page.office.offline = true
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    await page.settle()
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({
      v: 2, docId: DOC_ID, sub: 'usr_an', title: 'Báo cáo quý', format: 'docx', baseVersion: 1, baseEtag: page.office.etag(DOC_ID, 1), size: 1,
      role: 'owner', canDownload: true,
    })])
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(pendingRows(page.idb)).toEqual([])
  })

  async function leftBehind(write?: (office: FakeOffice) => void) {
    const idb = new FakeIdb()
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const first = await opened({ idb, office })
    office.offline = true
    await first.host!.save(DOC_ID, bytes(7, 7), { revision: 2, reason: 'auto' })
    await first.settle()
    office.offline = false
    write?.(office)
    return { idb, office }
  }

  it('offers the copy back on the next open ("Có bản chưa lưu lên máy chủ") and saves it on restore', async () => {
    const { idb, office } = await leftBehind()
    const page = await opened({ idb, office })
    expect(page.dialog()?.querySelector('h2')?.textContent).toBe('Có bản chưa lưu lên máy chủ')
    expect(actionLabels(page.dialog()!)).toEqual(['Khôi phục bản chưa lưu', 'Mở bản trên máy chủ'])
    expect(page.opened).toEqual([])
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    expect(page.opened).toHaveLength(1)
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, version: 1 })
    expect(list(page.opened[0].bytes)).toEqual([7, 7])
    expect(office.version(DOC_ID)).toBe(2)
    expect(list(office.latest(DOC_ID))).toEqual([7, 7])
    expect(pendingRows(idb)).toEqual([])
  })

  it('a newer server version still surfaces as a conflict when the copy is restored', async () => {
    const { idb, office } = await leftBehind(o => o.saveElsewhere(DOC_ID, bytes(4)))
    const page = await opened({ idb, office })
    expect(page.dialog()?.textContent).toContain('Trên máy chủ đã có bản mới hơn')
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    expect(page.dialogId()).toBe('conflict')
    expect(list(office.latest(DOC_ID))).toEqual([4])
    expect(pendingRows(idb)).toHaveLength(1)
  })

  it('drops a copy the server already holds (its save landed after the page lost the answer) without asking', async () => {
    const { idb, office } = await leftBehind(o => o.saveElsewhere(DOC_ID, bytes(7, 7)))
    const page = await opened({ idb, office })
    expect(page.dialog()).toBeNull()
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, version: 2 })
    expect(list(page.opened[0].bytes)).toEqual([7, 7])
    expect(pendingRows(idb)).toEqual([])
  })

  it('"Mở bản trên máy chủ" drops the copy and opens the server version', async () => {
    const { idb, office } = await leftBehind()
    const page = await opened({ idb, office })
    click(page, 'Mở bản trên máy chủ')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(list(page.opened[0].bytes)).toEqual([1, 2, 3])
    expect(pendingRows(idb)).toEqual([])
  })

  it('offline at open: offers the copy with the reason, and "Thử lại"', async () => {
    const { idb, office } = await leftBehind()
    office.offline = true
    const page = await opened({ idb, office })
    expect(page.dialog()?.textContent).toContain('Không kết nối được máy chủ')
    expect(actionLabels(page.dialog()!)).toEqual(['Khôi phục bản chưa lưu', 'Thử lại'])
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    expect(list(page.opened[0].bytes)).toEqual([7, 7])
    expect(badge(page).state).toBe('LOCAL_ONLY')
  })

  it('never offers a copy left by another account', async () => {
    const { idb, office } = await leftBehind()
    const page = await opened({ idb, office, account: { status: 'signed-in', sub: 'usr_binh' } })
    expect(page.dialog()).toBeNull()
    expect(list(page.opened[0].bytes)).toEqual([1, 2, 3])
    expect(pendingRows(idb)).toEqual([expect.objectContaining({ sub: 'usr_an' })])
  })

  it('a copy waiting behind an in-flight save is rebased on it, so its own save is no conflict', async () => {
    const page = await opened()
    const releaseFirst = page.office.holdNextPut()
    // A background retry is in flight when the editor saves newer bytes.
    const first = page.host!.save(DOC_ID, bytes(5), { revision: 2, reason: 'auto' })
    await page.settle()
    const second = page.host!.save(DOC_ID, bytes(6), { revision: 3, reason: 'auto' })
    await page.settle()
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({ baseVersion: 1, size: 1 })])
    const releaseSecond = page.office.holdNextPut()
    releaseFirst()
    expect(await first).toEqual({ status: 'saved', version: 2 })
    await page.settle()
    expect(pendingRows(page.idb)).toEqual([expect.objectContaining({ baseVersion: 2, baseEtag: page.office.etag(DOC_ID, 2) })])
    releaseSecond()
    expect(await second).toEqual({ status: 'saved', version: 3 })
    expect(list(page.office.latest(DOC_ID))).toEqual([6])
  })
})

describe('conflict', () => {
  async function conflicted() {
    const page = await opened()
    page.office.saveElsewhere(DOC_ID, bytes(4))
    await page.host!.save(DOC_ID, bytes(7, 8), { revision: 2, reason: 'auto' })
    await page.settle()
    return page
  }

  it('"Mở bản mới nhất" opens the latest version and drops the local copy', async () => {
    const page = await conflicted()
    click(page, 'Mở bản mới nhất')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(page.opened.at(-1)).toMatchObject({ docId: DOC_ID, version: 2 })
    expect(list(page.opened.at(-1)!.bytes)).toEqual([4])
    expect(pendingRows(page.idb)).toEqual([])
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 1, reason: 'auto' })).toEqual({ status: 'saved', version: 3 })
  })

  it('"Lưu bản của tôi thành bản sao" creates "<title> (bản của tôi)" from the editor bytes and opens it', async () => {
    const page = await conflicted()
    click(page, 'Lưu bản của tôi thành bản sao')
    await page.settle()
    expect(page.dialog()).toBeNull()
    const post = page.office.calls.find(c => c.method === 'POST')!
    expect((post.body as FormData).get('title')).toBe('Báo cáo quý (bản của tôi)')
    const copy = page.opened.at(-1)!
    expect(copy).toMatchObject({ title: 'Báo cáo quý (bản của tôi)', version: 1, format: 'docx' })
    expect(copy.docId).not.toBe(DOC_ID)
    expect(list(copy.bytes)).toEqual([7, 8])
    expect(list(page.office.latest(copy.docId))).toEqual([7, 8])
    // The original goes back to its latest version; the address now names the copy.
    expect(page.opened.at(-2)).toMatchObject({ docId: DOC_ID, version: 2 })
    expect(page.history.urls.at(-1)).toBe(`/van-ban/?doc=${copy.docId}`)
    expect(list(page.office.latest(DOC_ID))).toEqual([4])
    expect(pendingRows(page.idb)).toEqual([])
  })

  it('a failed copy shows why, re-enables the choices and retries with the same Idempotency-Key', async () => {
    const page = await conflicted()
    page.office.on(call => (call.method === 'POST' ? problem(413, 'QUOTA_EXCEEDED', { message_vi: 'Đã hết dung lượng lưu trữ.' }) : undefined))
    click(page, 'Lưu bản của tôi thành bản sao')
    await page.settle()
    expect(page.dialog()?.querySelector('.erp-online__note')?.textContent).toBe('Đã hết dung lượng lưu trữ.')
    expect(buttonNamed(page.dialog()!, 'Mở bản mới nhất').disabled).toBe(false)
    click(page, 'Lưu bản của tôi thành bản sao')
    await page.settle()
    const keys = page.office.calls.filter(c => c.method === 'POST').map(c => c.headers['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(page.dialog()).toBeNull()
  })

  it('keeps a title within 255 characters, without splitting a character', () => {
    const page = onlinePage({ scripts: ['online-open.js'] })
    const copyTitle = (page.window.erpOnline as { copyTitle(title: string): string }).copyTitle
    expect(copyTitle('Báo cáo')).toBe('Báo cáo (bản của tôi)')
    const long = copyTitle('😀'.repeat(300))
    expect(Array.from(long)).toHaveLength(255)
    expect(long.endsWith(' (bản của tôi)')).toBe(true)
    expect(long).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
  })
})

describe('leaving the page', () => {
  it('asks before unload while dirty, saving or holding unacknowledged bytes, not when everything is saved', async () => {
    const page = await opened()
    expect(page.fire('beforeunload').defaultPrevented).toBe(false)
    page.host!.dirty(DOC_ID, true)
    expect(page.fire('beforeunload').defaultPrevented).toBe(true)
    page.host!.dirty(DOC_ID, false)
    page.office.offline = true
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    const event = page.fire('beforeunload')
    expect(event.defaultPrevented).toBe(true)
    expect(event.returnValue).toBe('')
    page.office.offline = false
    page.fire('online')
    await page.settle()
    expect(page.fire('beforeunload').defaultPrevented).toBe(false)
  })

  it('sign-out flushes the editor and waits for its saves first', async () => {
    const page = onlinePage()
    const order: string[] = []
    page.fork(async () => {
      order.push('flush')
      await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'flush' })
      order.push('saved')
    })
    await page.settle()
    await page.account.signOut()
    expect(page.account.signOuts).toBe(1)
    expect(order).toEqual(['flush', 'saved'])
    expect(page.office.version(DOC_ID)).toBe(2)
  })

  it('a flush that never settles gives up after 10 s', async () => {
    const page = onlinePage()
    page.fork(() => new Promise(() => {}))
    await page.settle()
    let done = false
    void page.online.flush().then(() => { done = true })
    await tick(page, 9_999)
    expect(done).toBe(false)
    await tick(page, 1)
    expect(done).toBe(true)
  })

  it('beforeunload with edits asks the editor to flush before the page hides, not when everything is saved', async () => {
    const page = await opened()
    page.fire('beforeunload')
    expect(page.flushes).toBe(0)
    page.host!.dirty(DOC_ID, true)
    expect(page.fire('beforeunload').defaultPrevented).toBe(true)
    expect(page.flushes).toBe(1)
  })

  it('pagehide and a hidden tab ask the editor to flush', async () => {
    const page = await opened()
    page.fire('pagehide')
    page.document.visibilityState = 'hidden'
    page.document.fire(new FakeEvent('visibilitychange'))
    expect(page.flushes).toBe(2)
  })

  it('logs no document title, id or bytes', async () => {
    const page = await opened()
    page.office.offline = true
    await page.host!.save(DOC_ID, bytes(7), { revision: 2, reason: 'auto' })
    page.host!.opened(DOC_ID, false, 'parse')
    const text = JSON.stringify(page.logs)
    expect(text).not.toContain(DOC_ID)
    expect(text).not.toContain('Báo cáo')
  })
})
