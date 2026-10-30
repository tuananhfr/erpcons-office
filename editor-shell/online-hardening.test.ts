import { describe, expect, it, vi } from 'vitest'
import { actionLabels, buttonNamed } from './fake-dom.ts'
import { FakeIdb } from './fake-idb.ts'
import { DOC_ID, FakeOffice, problem } from './fake-office.ts'
import { flush, onlinePage, type PageOptions } from './online-harness.ts'

// Security review follow-ups of the online shell: the pending store per account (F1), the link token out of the
// address bar on every page (S2), the anonymous link page and its sign-in (I1), version view (I2) and offline
// restore (I3). settle() waits real macrotasks for the fake IndexedDB; on Windows timers that is slow.
vi.setConfig({ testTimeout: 30 * 1000 })

const bytes = (...values: number[]) => new Uint8Array(values)
const list = (value: Uint8Array) => Array.from(value)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const DAY = 24 * 60 * 60 * 1000
type Page = ReturnType<typeof onlinePage>

const office = (role = 'owner') => new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, role)
async function opened(options: PageOptions = {}) {
  const page = onlinePage(options)
  page.fork()
  await page.settle()
  return page
}
const click = (page: Page, label: string) => buttonNamed(page.dialog()!, label).click()
const title = (page: Page) => page.dialog()?.querySelector('h2')?.textContent
const pendingRows = (idb: FakeIdb) => idb.rows('pending')

/** A copy of usr_an's that the server never took: saved offline, then the page went away. */
async function leftBehind(store = office()) {
  const idb = new FakeIdb()
  const first = await opened({ idb, office: store })
  store.offline = true
  await first.host!.save(DOC_ID, bytes(7, 7), { revision: 2, reason: 'auto' })
  await first.settle()
  store.offline = false
  expect(pendingRows(idb)).toHaveLength(1)
  return { idb, store }
}
const v2Record = (over: Record<string, unknown> = {}) => ({
  v: 2, docId: DOC_ID, sub: 'usr_an', title: 'Báo cáo quý', format: 'docx', folderId: null, baseVersion: 1, baseEtag: `"${DOC_ID.slice(0, 8)}-v1"`,
  role: 'editor', canDownload: true, savedAt: Date.now() - 1000, size: 2, bytes: bytes(7, 7), ...over,
})
const presetV2 = (...rows: Record<string, unknown>[]) => new FakeIdb().preset(2, { pending: { keyPath: ['sub', 'docId'], rows } })

describe('F1: unsaved bytes whose document is gone', () => {
  it('opening it again offers "Lưu bản của tôi thành bản sao" with the bytes read-only; the copy removes the record', async () => {
    const { idb, store } = await leftBehind()
    store.setRole(DOC_ID, null)
    const page = await opened({ idb, office: store })
    expect(page.dialogId()).toBe('access-lost')
    expect(title(page)).toBe('Bạn không còn quyền mở tài liệu này')
    expect(actionLabels(page.dialog()!)).toEqual(['Lưu bản của tôi thành bản sao', 'Bỏ bản của tôi', 'Đóng'])
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, mode: 'view' })
    expect(list(page.opened[0].bytes)).toEqual([7, 7])
    // The periodic check must not cover the offer with "not found".
    await flush()
    page.clock.advance(31 * 1000)
    await page.settle()
    expect(page.dialogId()).toBe('access-lost')
    click(page, 'Lưu bản của tôi thành bản sao')
    await page.settle()
    expect(page.dialog()).toBeNull()
    const copy = page.opened.at(-1)!
    expect(copy).toMatchObject({ mode: 'edit', title: 'Báo cáo quý (bản của tôi)' })
    expect(list(store.latest(copy.docId))).toEqual([7, 7])
    expect(pendingRows(idb)).toEqual([])
  })

  it('"Bỏ bản của tôi" removes the record; "Đóng" keeps it for next time', async () => {
    const { idb, store } = await leftBehind()
    store.setRole(DOC_ID, null)
    const kept = await opened({ idb, office: store })
    click(kept, 'Đóng')
    await kept.settle()
    expect(pendingRows(idb)).toHaveLength(1)
    const page = await opened({ idb, office: store })
    expect(page.dialogId()).toBe('access-lost')
    click(page, 'Bỏ bản của tôi')
    await page.settle()
    expect(page.dialog()).toBeNull()
    expect(pendingRows(idb)).toEqual([])
  })

  it('another account\'s record is never offered: plain "not found"', async () => {
    const { idb, store } = await leftBehind()
    store.setRole(DOC_ID, null)
    const page = await opened({ idb, office: store, account: { status: 'signed-in', sub: 'usr_binh' } })
    expect(page.dialogId()).toBe('not-found')
    expect(page.opened).toEqual([])
    expect(pendingRows(idb)).toHaveLength(1)
  })

  it('a record older than 30 days is not offered and is deleted', async () => {
    const idb = presetV2(v2Record({ savedAt: Date.now() - 31 * DAY }))
    const page = await opened({ idb, office: office() })
    expect(page.dialog()).toBeNull()
    expect(list(page.opened[0].bytes)).toEqual([1, 2, 3])
    expect(pendingRows(idb)).toEqual([])
  })
})

describe('F1: explicit sign-out', () => {
  async function withLeftovers() {
    const { idb, store } = await leftBehind()
    // Another document's copy of the same account, and one of another account: only the first goes.
    idb.seed('pending', v2Record({ docId: '7f3e2d1c-0b9a-4876-8543-210fedcba987' }))
    idb.seed('pending', v2Record({ sub: 'usr_binh' }))
    store.offline = true
    const page = await opened({ idb, office: store })
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    return { idb, page }
  }
  async function signOut(page: Page) {
    const done = page.account.signOut()
    await page.settle()
    return done
  }

  it('asks when unsaved bytes remain after the flush; "Xoá và đăng xuất" deletes only that account\'s records', async () => {
    const { idb, page } = await withLeftovers()
    const done = signOut(page)
    await page.settle()
    expect(page.dialogId()).toBe('sign-out-pending')
    expect(title(page)).toBe('Còn thay đổi chưa lưu lên máy chủ. Xoá khi đăng xuất?')
    expect(page.account.signOuts).toBe(0)
    click(page, 'Xoá và đăng xuất')
    await done
    await page.settle()
    expect(page.account.signOuts).toBe(1)
    expect(pendingRows(idb).map(r => r.sub)).toEqual(['usr_binh'])
  })

  it('"Giữ lại và đăng xuất" signs out and keeps them; "Huỷ" does not sign out', async () => {
    const { idb, page } = await withLeftovers()
    const cancelled = signOut(page)
    await page.settle()
    click(page, 'Huỷ')
    await cancelled
    expect(page.account.signOuts).toBe(0)
    expect(page.account.status()).toBe('signed-in')
    const kept = signOut(page)
    await page.settle()
    click(page, 'Giữ lại và đăng xuất')
    await kept
    expect(page.account.signOuts).toBe(1)
    expect(pendingRows(idb)).toHaveLength(3)
  })

  it('nothing left after the flush: signs out without asking', async () => {
    const page = await opened()
    await signOut(page)
    expect(page.dialog()).toBeNull()
    expect(page.account.signOuts).toBe(1)
  })
})

describe('S2: a #link= fragment never stays in the address bar', () => {
  it.each([
    ['with ?doc=', { search: `?doc=${DOC_ID}`, hash: `#link=${TOKEN}` }, `/van-ban/?doc=${DOC_ID}`],
    ['embedded', { search: '?embed=erpcons&parent=https%3A%2F%2Ferp.example', hash: `#link=${TOKEN}` }, '/van-ban/?embed=erpcons&parent=https%3A%2F%2Ferp.example'],
    ['on another path', { pathname: '/kham-pha/', search: '', hash: `#link=${TOKEN}` }, '/kham-pha/'],
    ['with extra parameters', { search: '', hash: `#link=${TOKEN}&x=1` }, '/van-ban/'],
    ['without the account script', { search: '', hash: `#link=${TOKEN}`, noAccount: true }, '/van-ban/'],
  ] as [string, PageOptions, string][])('%s', async (_name, options, url) => {
    const store = office()
    store.links.set(TOKEN, DOC_ID)
    const page = onlinePage({ office: store, account: { status: 'signed-out', sub: '' }, ...options })
    expect(page.history.urls[0]).toBe(url)
    expect(page.location.hash).toBe('')
    await page.settle()
    expect(page.history.urls.join(' ')).not.toContain(TOKEN)
    // None of these is the link page: nothing is fetched with the token.
    expect(store.linkCalls).toEqual([])
  })
})

describe('I1 and signing in on the link page', () => {
  function linkStore() {
    const store = office()
    store.links.set(TOKEN, DOC_ID)
    return store
  }
  const linkOptions = (store: FakeOffice, status: 'signed-in' | 'signed-out' = 'signed-out'): PageOptions =>
    ({ office: store, search: '', hash: `#link=${TOKEN}`, account: { status, sub: status === 'signed-in' ? 'usr_an' : '' } })

  it('the editor never learns a name there, even signed in or after an account change', async () => {
    const page = await opened(linkOptions(linkStore(), 'signed-in'))
    page.account.set('signed-in', 'usr_binh')
    await page.settle()
    expect(page.users).toEqual([null])
    expect(page.location.assigned).toEqual([])
  })

  it('a sign-in with access to the document continues on /<editor>/?doc=<id>, without the token', async () => {
    const page = await opened(linkOptions(linkStore()))
    page.account.set('signed-in', 'usr_an')
    await page.settle()
    expect(page.location.assigned).toEqual([`/van-ban/?doc=${DOC_ID}`])
    expect(page.location.assigned.join(' ')).not.toContain(TOKEN)
    expect(page.users).toEqual([null])
  })

  it('a sign-in without access stays on the link view', async () => {
    const store = linkStore()
    const page = await opened(linkOptions(store))
    store.on(call => (call.method === 'GET' && call.path === `/api/v1/documents/${DOC_ID}` ? problem(404, 'NOT_FOUND') : undefined))
    page.account.set('signed-in', 'usr_binh')
    await page.settle()
    expect(page.location.assigned).toEqual([])
    expect(page.dialog()).toBeNull()
    expect(page.opened).toHaveLength(1)
  })
})

describe('I2: an old version is never saved over the document', () => {
  it.each(['manual', 'auto', 'flush'])('a %s save is refused without a request', async (reason) => {
    const store = office()
    store.saveElsewhere(DOC_ID, bytes(4))
    const page = await opened({ office: store, search: `?doc=${DOC_ID}&version=1` })
    expect(page.opened[0]).toMatchObject({ mode: 'view', version: 1 })
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason })).toMatchObject({ status: 'failed', retryable: false })
    await flush()
    expect(store.puts()).toEqual([])
    expect(pendingRows(page.idb)).toEqual([])
  })
})

describe('I3: restoring without the server uses the access stored with the bytes', () => {
  it.each([
    ['a viewer\'s record', presetV2(v2Record({ role: 'viewer' })), 'view'],
    ['a record from before roles were stored', new FakeIdb().preset(1, { pending: { keyPath: 'docId', rows: [{ ...v2Record(), v: 1, role: undefined, canDownload: undefined }] } }), 'view'],
    ['an editor\'s record', presetV2(v2Record({ role: 'editor' })), 'edit'],
  ] as [string, FakeIdb, string][])('%s opens in %s mode', async (_name, idb, mode) => {
    const store = office()
    store.offline = true
    const page = await opened({ idb, office: store })
    expect(page.dialogId()).toBe('pending')
    click(page, 'Khôi phục bản chưa lưu')
    await page.settle()
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, mode })
    expect(list(page.opened[0].bytes)).toEqual([7, 7])
    if (mode === 'edit') expect(store.puts().length).toBeGreaterThan(0)
    else expect(store.puts()).toEqual([])
  })
})
