import { describe, expect, it, vi } from 'vitest'
import { buttonNamed, type FakeElement } from './fake-dom.ts'
import { DOC_ID, FakeOffice } from './fake-office.ts'
import { flush, onlinePage, type PageOptions } from './online-harness.ts'

// erpHost v2 on the shell side (docs/erp-host.md): modes from the role, setMode/setUser, read-only saves, losing
// access while open, the periodic check, the share/history frames, version view and the public link page.
// Each settle() waits real macrotasks for the fake IndexedDB; on Windows timers that is ~0.35 s a step.
vi.setConfig({ testTimeout: 30 * 1000 })

const bytes = (...values: number[]) => new Uint8Array(values)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const CHECK = 30 * 1000
const FRAME = 16
const READ_ONLY = 'Tài liệu đang mở ở chế độ chỉ xem nên không lưu lên máy chủ.'

type Page = ReturnType<typeof onlinePage>

const office = (role = 'owner') => new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, role)
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
const gets = (page: Page) => page.office.calls.filter(c => c.method === 'GET' && c.path === `/api/v1/documents/${DOC_ID}`).length
const button = (page: Page, key: string) => page.document.querySelector(`[data-erp-online-${key}]`)
const shown = (page: Page, key: string) => {
  const node = button(page, key)
  return Boolean(node && !node.hidden && !node.parent!.hidden)
}
const modeBadge = (page: Page) => {
  const node = page.document.querySelector('[data-erp-mode]')
  return node && !node.hidden ? node.textContent : null
}

describe('modes from the role', () => {
  it.each([
    ['owner', 'edit'], ['editor', 'edit'], ['commenter', 'comment'], ['viewer', 'view'],
  ])('%s opens in %s mode, after the editor learnt who is signed in', async (role, mode) => {
    const page = await opened({ office: office(role) })
    expect(page.opened).toHaveLength(1)
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, mode, canDownload: true, version: 1 })
    expect(page.opened[0].preserveView).toBeUndefined()
    expect(page.users).toEqual([{ id: 'usr_an', name: 'Nguyễn Văn An' }])
  })

  it('a viewer: badge "Chỉ xem", neither Chia sẻ nor Lịch sử, and a save is refused without a request', async () => {
    const page = await opened({ office: office('viewer') })
    expect(modeBadge(page)).toBe('Chỉ xem')
    expect(shown(page, 'share')).toBe(false)
    expect(shown(page, 'history')).toBe(false)
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'manual' })).toEqual({ status: 'failed', retryable: false, message: READ_ONLY })
    expect(page.office.puts()).toEqual([])
    expect(page.idb.rows('pending')).toEqual([])
  })

  it('a commenter reads "Chỉ xem" until web comments come (M5), with no Chia sẻ or Lịch sử', async () => {
    const page = await opened({ office: office('commenter') })
    expect(page.opened[0]).toMatchObject({ mode: 'comment' })
    expect(modeBadge(page)).toBe('Chỉ xem')
    expect(page.document.querySelector('[data-erp-mode]')!.title).toBe('Nhận xét trên web sẽ có sau, hiện chỉ xem được')
    expect(shown(page, 'share')).toBe(false)
    expect(shown(page, 'history')).toBe(false)
  })

  it.each(['owner', 'editor'])('an %s gets no badge, Chia sẻ and Lịch sử', async (role) => {
    const page = await opened({ office: office(role) })
    expect(modeBadge(page)).toBeNull()
    expect(shown(page, 'share')).toBe(true)
    expect(shown(page, 'history')).toBe(true)
  })

  it('setUser follows the account: a profile that arrives later is passed on', async () => {
    const page = await opened()
    page.account.set('signed-in')
    expect(page.users).toHaveLength(2)
  })
})

describe('the periodic check (no live channel in phase 2)', () => {
  it('a downgrade reaches the editor as setMode and hides Chia sẻ and Lịch sử', async () => {
    const page = await opened({ office: office('editor') })
    expect(shown(page, 'share')).toBe(true)
    page.office.setRole(DOC_ID, 'viewer', false)
    await tick(page, CHECK)
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: false }])
    expect(modeBadge(page)).toBe('Chỉ xem')
    expect(shown(page, 'share')).toBe(false)
    expect(shown(page, 'history')).toBe(false)
  })

  it('an editor whose owner turned "editors can share" off gets no Chia sẻ; the owner still does', async () => {
    const refused = office('editor')
    refused.setCanShare(DOC_ID, false)
    const editor = await opened({ office: refused })
    expect(editor.opened[0]).toMatchObject({ mode: 'edit' })
    expect(shown(editor, 'share')).toBe(false)
    expect(shown(editor, 'history')).toBe(true)
    const owner = office('owner')
    owner.setCanShare(DOC_ID, false)
    expect(shown(await opened({ office: owner }), 'share')).toBe(true)
  })

  it('Chia sẻ follows can_share on each refresh, without a mode change', async () => {
    const page = await opened({ office: office('editor') })
    expect(shown(page, 'share')).toBe(true)
    page.office.setCanShare(DOC_ID, false)
    await tick(page, CHECK)
    expect(shown(page, 'share')).toBe(false)
    page.office.setCanShare(DOC_ID, true)
    await tick(page, CHECK)
    expect(shown(page, 'share')).toBe(true)
    expect(page.modes).toEqual([])
  })

  it('a viewer made editor gets Chia sẻ at the next check', async () => {
    const page = await opened({ office: office('viewer') })
    expect(shown(page, 'share')).toBe(false)
    page.office.setRole(DOC_ID, 'editor')
    await tick(page, CHECK)
    expect(modeBadge(page)).toBeNull()
    expect(shown(page, 'share')).toBe(true)
  })

  it('edits in hand get their save attempt before the downgrade applies', async () => {
    let flushed = 0
    const page = onlinePage()
    page.fork(async () => { flushed += 1 })
    await page.settle()
    page.host!.dirty(DOC_ID, true)
    page.office.setRole(DOC_ID, 'commenter')
    await tick(page, CHECK)
    expect(flushed).toBeGreaterThan(0)
    await tick(page, 20 * 1000)
    expect(page.modes.at(-1)).toEqual({ docId: DOC_ID, mode: 'comment', canDownload: true })
  })

  it('a reader gets a newer version in place, with preserveView', async () => {
    const page = await opened({ office: office('viewer') })
    page.office.saveElsewhere(DOC_ID, bytes(5))
    await tick(page, CHECK)
    expect(page.opened).toHaveLength(2)
    expect(page.opened[1]).toMatchObject({ version: 2, mode: 'view', preserveView: true })
    expect([...page.opened[1].bytes]).toEqual([5])
  })

  it('removed while reading: says so once and stops asking', async () => {
    const page = await opened({ office: office('viewer') })
    page.office.setRole(DOC_ID, null)
    await tick(page, CHECK)
    expect(page.dialogId()).toBe('gone')
    const asked = gets(page)
    await tick(page, 5 * CHECK)
    expect(gets(page)).toBe(asked)
  })

  it('never checks while the page is hidden', async () => {
    const page = await opened()
    const before = gets(page)
    page.document.visibilityState = 'hidden'
    await tick(page, 3 * CHECK)
    expect(gets(page)).toBe(before)
  })
})

describe('every downgrade: flush, setMode, then flush again only while dirty', () => {
  // A fork as the contract describes it: flush hands a dirty document to save (reason flush), and the switch to a
  // read-only mode commits what an inline editor still held one frame later (as Văn bản does), leaving it dirty.
  async function forkPage(commitOnSwitch: boolean) {
    const steps: string[] = []
    let revision = 1
    let dirty = false
    let held = bytes(9)
    const page = onlinePage({ office: office('editor') })
    page.fork(async () => {
      steps.push('flush')
      if (!dirty) return
      const result = await page.host!.save(DOC_ID, held, { revision, reason: 'flush' })
      steps.push(`save:${result.status}`)
      if (result.status === 'saved') { dirty = false; page.host!.dirty(DOC_ID, false) }
    }, () => {}, (_id, mode) => {
      steps.push(`setMode:${mode}`)
      // Only the first switch finds text in an inline editor.
      if (!commitOnSwitch || steps.filter(step => step.startsWith('setMode')).length > 1) return
      page.clock.setTimeout(() => {
        revision += 1
        held = bytes(9, 9)
        dirty = true
        page.host!.dirty(DOC_ID, true)
      }, FRAME)
    })
    await page.settle()
    const edit = () => { revision += 1; dirty = true; page.host!.dirty(DOC_ID, true) }
    return { page, steps, edit }
  }
  // The check, the fork's next frame, then past the shell's wait for a late dirty report.
  async function downgradeSeen(page: Page) {
    await tick(page, CHECK)
    await tick(page, FRAME)
    await tick(page, 1000)
  }

  it('a clean document: one flush before setMode, none after', async () => {
    const { page, steps } = await forkPage(false)
    page.office.setRole(DOC_ID, 'viewer')
    await downgradeSeen(page)
    expect(steps).toEqual(['flush', 'setMode:view'])
    expect(page.office.puts()).toEqual([])
  })

  it('edits in hand go out first; refused, they end read-only with one offer, and a still-dirty document is flushed again', async () => {
    const { page, steps, edit } = await forkPage(false)
    edit()
    page.office.setRole(DOC_ID, 'commenter')
    await downgradeSeen(page)
    expect(steps).toEqual(['flush', 'save:failed', 'setMode:view', 'flush', 'save:failed'])
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: true }])
    expect(page.dialogId()).toBe('access-lost')
    expect(page.document.querySelectorAll('[data-erp-online-dialog]')).toHaveLength(1)
    expect(page.idb.rows('pending')).toHaveLength(1)
  })

  it('the switch commits text still being typed, reported a frame later: the second flush sends it, and its 403 ends in the copy offer', async () => {
    const { page, steps } = await forkPage(true)
    page.office.setRole(DOC_ID, 'commenter')
    await tick(page, CHECK)
    expect(steps).toEqual(['flush', 'setMode:comment'])
    await tick(page, FRAME)
    await tick(page, 1000)
    expect(steps).toEqual(['flush', 'setMode:comment', 'flush', 'save:failed', 'setMode:view'])
    // Sent, not refused as read-only: the 403 is the server's answer.
    expect(page.office.puts()).toHaveLength(1)
    expect(page.idb.rows('pending')).toHaveLength(1)
    expect(page.dialogId()).toBe('access-lost')
    buttonNamed(page.dialog()!, 'Lưu bản của tôi thành bản sao').click()
    await page.settle()
    expect([...page.opened.at(-1)!.bytes]).toEqual([9, 9])
    expect(page.opened.at(-1)).toMatchObject({ mode: 'edit', title: 'Báo cáo quý (bản của tôi)' })
  })

  it('a document opened read-only stays without save traffic, even with reason flush', async () => {
    const page = await opened({ office: office('viewer') })
    page.host!.dirty(DOC_ID, true)
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'flush' })).toEqual({ status: 'failed', retryable: false, message: READ_ONLY })
    expect(page.office.puts()).toEqual([])
  })
})

describe('a save refused after access changed', () => {
  it('403: read-only from now on, the bytes kept, and a copy in the user\'s own root folder on request', async () => {
    const page = await opened({ office: new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), 'f0f0f0f0-0000-4000-8000-000000000001', 'editor') })
    page.office.setRole(DOC_ID, 'viewer')
    page.host!.dirty(DOC_ID, true)
    const result = await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'manual' })
    expect(result.status).toBe('failed')
    await page.settle()
    expect(page.dialogId()).toBe('access-lost')
    expect(page.dialog()!.textContent).toContain('Bạn không còn quyền chỉnh sửa tài liệu này')
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: true }])
    expect(page.idb.rows('pending')).toHaveLength(1)
    buttonNamed(page.dialog()!, 'Lưu bản của tôi thành bản sao').click()
    await page.settle()
    const create = page.office.calls.find(c => c.method === 'POST' && c.path === '/api/v1/documents')!
    expect((create.body as FormData).get('folder_id')).toBeNull()
    const copy = page.opened.at(-1)!
    expect(copy.docId).not.toBe(DOC_ID)
    expect(copy).toMatchObject({ mode: 'edit', title: 'Báo cáo quý (bản của tôi)' })
    expect([...copy.bytes]).toEqual([9])
    expect(page.location.search).toContain(copy.docId)
    expect(page.dialog()).toBeNull()
  })

  it('404 (removed): the same offer, worded for a document no longer reachable', async () => {
    const page = await opened()
    page.office.setRole(DOC_ID, null)
    page.host!.dirty(DOC_ID, true)
    await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'manual' })
    await page.settle()
    expect(page.dialogId()).toBe('access-lost')
    expect(page.dialog()!.textContent).toContain('Bạn không còn quyền mở tài liệu này')
    expect(page.modes.at(-1)).toMatchObject({ mode: 'view' })
  })
})

describe('?version=<seq>', () => {
  it('opens that version read-only, with no buttons and no periodic check', async () => {
    const store = office()
    store.saveElsewhere(DOC_ID, bytes(4))
    const page = await opened({ office: store, search: `?doc=${DOC_ID}&version=1` })
    expect(page.opened[0]).toMatchObject({ mode: 'view', version: 1 })
    expect([...page.opened[0].bytes]).toEqual([1, 2, 3])
    expect(page.document.querySelector('[data-erp-online-actions]')).toBeNull()
    expect(await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'manual' })).toMatchObject({ status: 'failed', retryable: false })
    const asked = page.office.calls.length
    await tick(page, 3 * CHECK)
    expect(page.office.calls).toHaveLength(asked)
  })

  it.each(['0', '1.5', 'abc', '01'])('a version "%s" is refused without a request', async (seq) => {
    const page = onlinePage({ search: `?doc=${DOC_ID}&version=${seq}` })
    await page.settle()
    expect(page.dialog()).not.toBeNull()
    expect(page.office.calls).toEqual([])
  })
})

describe('Chia sẻ and Lịch sử open the /tai-lieu/ panels in a frame', () => {
  function frameOf(page: Page) {
    const overlay = page.document.querySelector('[data-erp-online-panel]')
    return overlay ? { overlay, frame: overlay.children[0] as FakeElement & { src: string; contentWindow?: object } } : null
  }

  it('Chia sẻ: the frame shows /tai-lieu/chia-se/; only that frame, on this origin, may close it', async () => {
    const page = await opened()
    button(page, 'share')!.click()
    const opened1 = frameOf(page)!
    expect(opened1.overlay.getAttribute('data-erp-online-panel')).toBe('share')
    expect(opened1.frame.src).toBe(`/tai-lieu/chia-se/?doc=${DOC_ID}`)
    opened1.frame.contentWindow = {}
    page.messages({ erpDocsPanel: 'close' }, {})
    page.messages({ erpDocsPanel: 'close' }, opened1.frame.contentWindow, 'https://evil.example')
    expect(frameOf(page)).not.toBeNull()
    page.messages({ erpDocsPanel: 'close' }, opened1.frame.contentWindow)
    expect(frameOf(page)).toBeNull()
  })

  it('Lịch sử saves the edits first; "restored" closes it and shows the new version in place', async () => {
    let flushed = 0
    const page = onlinePage()
    page.fork(async () => { flushed += 1 })
    await page.settle()
    page.host!.dirty(DOC_ID, true)
    button(page, 'history')!.click()
    await page.settle()
    expect(flushed).toBe(1)
    const panel = frameOf(page)!
    expect(panel.frame.src).toBe(`/tai-lieu/lich-su/?doc=${DOC_ID}`)
    panel.frame.contentWindow = {}
    page.office.saveElsewhere(DOC_ID, bytes(1, 2))
    page.messages({ erpDocsPanel: 'restored' }, panel.frame.contentWindow)
    await page.settle()
    expect(frameOf(page)).toBeNull()
    expect(page.opened.at(-1)).toMatchObject({ version: 2, preserveView: true, mode: 'edit' })
  })
})

describe('the public link page /<editor>/#link=<token>', () => {
  function linkPage(canDownload = true) {
    const store = office()
    store.setRole(DOC_ID, 'owner', canDownload)
    store.links.set(TOKEN, DOC_ID)
    return { store, options: { office: store, search: '', hash: `#link=${TOKEN}`, account: { status: 'signed-out' as const, sub: '' } } }
  }

  it('opens read-only without signing in, never with credentials, and offers Tải về', async () => {
    const { store, options } = linkPage()
    const page = await opened(options)
    expect(page.opened[0]).toMatchObject({ docId: DOC_ID, mode: 'view', canDownload: true })
    expect(page.users).toEqual([null])
    expect(store.calls).toEqual([])
    expect(store.linkCalls.map(c => c.path).sort()).toEqual(['/api/v1/link', '/api/v1/link/content'])
    for (const call of store.linkCalls) {
      expect(call.init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' })
      expect(new Headers(call.init.headers).get('X-Link-Token')).toBe(TOKEN)
    }
    expect(modeBadge(page)).toBe('Chỉ xem')
    expect(shown(page, 'download')).toBe(true)
    expect(shown(page, 'share')).toBe(false)
    expect((await page.host!.save(DOC_ID, bytes(9), { revision: 2, reason: 'manual' })).status).toBe('failed')
  })

  it('no Tải về when the owner turned downloads off', async () => {
    const page = await opened(linkPage(false).options)
    expect(page.opened[0]).toMatchObject({ canDownload: false })
    expect(shown(page, 'download')).toBe(false)
  })

  it('a token that cannot be one: "no longer usable", and no request', async () => {
    const { store } = linkPage()
    const page = onlinePage({ office: store, search: '', hash: '#link=abc', account: { status: 'signed-out', sub: '' } })
    await page.settle()
    expect(page.dialogId()).toBe('gone')
    expect(store.linkCalls).toEqual([])
  })

  it('a link turned off while open: the next check says so and stops', async () => {
    const { store, options } = linkPage()
    const page = await opened(options)
    store.links.delete(TOKEN)
    await tick(page, CHECK)
    expect(page.dialogId()).toBe('gone')
    expect(page.dialog()!.textContent).toContain('Đường liên kết này không còn dùng được')
    const asked = store.linkCalls.length
    await tick(page, 3 * CHECK)
    expect(store.linkCalls).toHaveLength(asked)
  })

  it('takes the token out of the address bar before the first request', async () => {
    const { store, options } = linkPage()
    const page = onlinePage(options)
    expect(page.history.urls).toEqual(['/van-ban/'])
    expect(page.location.hash).toBe('')
    expect(store.linkCalls.length).toBeGreaterThan(0)
    expect(page.hashAtFetch.every(hash => hash === '')).toBe(true)
  })

  it('a token in the query is not a link page: no request carries it', async () => {
    const { store } = linkPage()
    const page = onlinePage({ office: store, search: `?link=${TOKEN}`, account: { status: 'signed-out', sub: '' } })
    await page.settle()
    expect(store.linkCalls).toEqual([])
    // No erpHost: the editor runs as the Free tier.
    expect(page.host).toBeUndefined()
  })

  it('never logs the token', async () => {
    const { store, options } = linkPage()
    const page = await opened(options)
    store.offline = true
    await tick(page, CHECK)
    expect(JSON.stringify(page.logs)).not.toContain(TOKEN)
  })
})
