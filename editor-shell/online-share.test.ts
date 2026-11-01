import { describe, expect, it, vi } from 'vitest'
import { ONLINE_SCRIPTS } from '../src/lib/editor-shell/assets.ts'
import { MIME_BY_EXTENSION } from '../src/lib/files/mime-types.ts'
import { actionLabels, buttonNamed } from './fake-dom.ts'
import { DOC_ID, FakeOffice } from './fake-office.ts'
import { flush, onlinePage, type PageOptions } from './online-harness.ts'

// The editors' own "Chia sẻ" (window.erpShare) with online documents on: the page's document opens the Cloud share
// dialog, a local file can be saved to "Tài liệu của tôi" and shared, and a copy can still be sent.
vi.setConfig({ testTimeout: 30 * 1000 })

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SCRIPTS = ['share.js', ...ONLINE_SCRIPTS]
const bytes = (...values: number[]) => new Uint8Array(values)
type Page = ReturnType<typeof onlinePage>

/** A browser whose Web Share takes every file (Safari, Android) or none (desktop Chromium for Office types). */
function webShare(can: boolean) {
  const shared: { files: File[] }[] = []
  return { shared, navigator: { canShare: () => can, share: (data: { files: File[] }) => { shared.push(data); return Promise.resolve() } } }
}
function page(options: PageOptions = {}) {
  const p = onlinePage({ scripts: SCRIPTS, ...options })
  Object.assign(p.window, { erpMimeTypes: MIME_BY_EXTENSION, erpIntake: { message: (code: string) => `[${code}]`, displayName: (name: string) => name } })
  return p
}
async function opened(options: PageOptions = {}) {
  const p = page(options)
  p.fork()
  await p.settle()
  return p
}
const w = (p: Page) => p.window as unknown as { erpCanShareFiles(mime?: string): boolean; erpShare(b: Uint8Array, n: string, m: string): boolean }
const panel = (p: Page) => p.document.querySelector('[data-erp-online-panel]')?.getAttribute('data-erp-online-panel') ?? null
const click = (p: Page, label: string) => buttonNamed(p.dialog()!, label).click()
const local = { search: '' }

describe('erpCanShareFiles with online documents on', () => {
  it('says yes for every type, so each editor shows its Chia sẻ and calls erpShare', () => {
    const p = page({ ...local, navigator: webShare(false).navigator })
    expect(w(p).erpCanShareFiles(DOCX)).toBe(true)
    expect(w(p).erpCanShareFiles()).toBe(true)
  })

  it.each([
    ['embedded in ERP', { search: '?embed=erpcons&parent=https%3A%2F%2Ferp.example' }],
    ['the public link page', { search: '', hash: '#link=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde', account: { status: 'signed-out' as const, sub: '' } }],
    ['without PI sign-in', { search: '', account: { status: 'disabled' as const, sub: '' } }],
  ] as [string, PageOptions][])('keeps the plain Web Share answer %s', (_name, options) => {
    const p = page({ navigator: webShare(false).navigator, ...options })
    expect(w(p).erpCanShareFiles(DOCX)).toBe(false)
  })
})

describe('erpShare on an online document /<editor>/?doc=<id>', () => {
  it('opens the Cloud share dialog for the page document and ignores the bytes', async () => {
    const p = await opened({ navigator: webShare(true).navigator })
    expect(w(p).erpShare(bytes(9), 'Báo cáo quý.docx', DOCX)).toBe(true)
    expect(panel(p)).toBe('share')
    expect(p.dialog()).toBeNull()
    expect(p.office.calls.filter(c => c.method === 'POST')).toEqual([])
  })

  it('a viewer gets the plain copy, as before (the editor downloads when Web Share declines)', async () => {
    const store = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1), null, 'viewer')
    const p = await opened({ office: store, navigator: webShare(false).navigator })
    expect(w(p).erpShare(bytes(9), 'Báo cáo quý.docx', DOCX)).toBe(false)
    expect(panel(p)).toBeNull()
    expect(p.dialog()).toBeNull()
  })

  it('another document open on the same page is a local file', async () => {
    const p = await opened({ navigator: webShare(false).navigator })
    expect(w(p).erpShare(bytes(9), 'Hợp đồng.docx', DOCX)).toBe(true)
    expect(panel(p)).toBeNull()
    expect(p.dialogId()).toBe('share-local')
  })

  it('opens the share dialog once the document loads when the URL asks with share=1, then drops it', async () => {
    const p = await opened({ search: `?doc=${DOC_ID}&share=1` })
    expect(panel(p)).toBe('share')
    expect(p.location.search).toBe(`?doc=${DOC_ID}`)
  })
})

describe('erpShare on a local file', () => {
  it('signed in: save to Tài liệu của tôi as the documents page uploads, then open it with its share dialog', async () => {
    const p = page({ ...local, navigator: webShare(false).navigator })
    expect(w(p).erpShare(bytes(80, 75, 3, 4), 'Hợp đồng.docx', DOCX)).toBe(true)
    expect(p.dialogId()).toBe('share-local')
    expect(actionLabels(p.dialog()!)).toEqual(['Lưu lên Tài liệu của tôi và chia sẻ', 'Tải bản sao xuống', 'Đóng'])
    click(p, 'Lưu lên Tài liệu của tôi và chia sẻ')
    await p.settle()
    const [post] = p.office.calls.filter(c => c.method === 'POST')
    expect(post.path).toBe('/api/v1/documents')
    expect(post.headers['Idempotency-Key']).toMatch(/\S/)
    const form = post.body as FormData
    expect(form.has('title')).toBe(false)
    expect((form.get('file') as File).name).toBe('Hợp đồng.docx')
    const stored = [...p.office.docs.values()].find(d => d.title === 'Hợp đồng')!
    expect(Array.from(stored.versions[0])).toEqual([80, 75, 3, 4])
    expect(p.location.assigned).toEqual([`https://office.erpcons.ai/van-ban/?doc=${stored.id}&share=1`])
  })

  it('a failed upload says why and keeps the same idempotency key for the retry', async () => {
    const p = page(local)
    p.office.offline = true
    w(p).erpShare(bytes(1), 'Hợp đồng.docx', DOCX)
    click(p, 'Lưu lên Tài liệu của tôi và chia sẻ')
    await p.settle()
    expect(p.dialog()!.textContent).toContain('Không kết nối được máy chủ')
    p.office.offline = false
    click(p, 'Lưu lên Tài liệu của tôi và chia sẻ')
    await p.settle()
    const keys = p.office.calls.filter(c => c.method === 'POST').map(c => c.headers['Idempotency-Key'])
    expect(keys).toHaveLength(2)
    expect(keys[0]).toBe(keys[1])
    expect(p.location.assigned).toHaveLength(1)
  })

  it('signed out: sign in from the dialog, then continue with the upload', async () => {
    const p = page({ ...local, account: { status: 'signed-out', sub: '' } })
    w(p).erpShare(bytes(1), 'Bảng lương.xlsx', MIME_BY_EXTENSION.xlsx[0])
    expect(actionLabels(p.dialog()!)).toEqual(['Đăng nhập để lưu lên Cloud', 'Tải bản sao xuống', 'Đóng'])
    p.account.signIn = () => { p.account.signIns += 1; p.account.set('signed-in', 'usr_an'); return Promise.resolve({ status: 'signed-in' }) }
    click(p, 'Đăng nhập để lưu lên Cloud')
    await p.settle()
    expect(p.account.signIns).toBe(1)
    expect(p.location.assigned).toHaveLength(1)
    expect(p.location.assigned[0]).toMatch(/^https:\/\/office\.erpcons\.ai\/bang-tinh\/\?doc=[0-9a-f-]{36}&share=1$/)
  })

  it('signed out: a closed sign-in popup uploads nothing', async () => {
    const p = page({ ...local, account: { status: 'signed-out', sub: '' } })
    w(p).erpShare(bytes(1), 'Hợp đồng.docx', DOCX)
    click(p, 'Đăng nhập để lưu lên Cloud')
    await p.settle()
    expect(p.office.calls).toEqual([])
    expect(p.dialogId()).toBe('share-local')
  })

  it('Gửi bản sao opens the share sheet from the dialog click where the browser can share the type', async () => {
    const share = webShare(true)
    const p = page({ ...local, navigator: share.navigator })
    w(p).erpShare(bytes(1, 2), 'Hợp đồng.docx', DOCX)
    click(p, 'Gửi bản sao')
    await flush()
    expect(p.dialog()).toBeNull()
    expect(share.shared).toHaveLength(1)
    expect(share.shared[0].files[0].name).toBe('Hợp đồng.docx')
    expect(p.office.calls).toEqual([])
  })

  it('Tải bản sao xuống downloads the copy where it cannot', () => {
    const p = page({ ...local, navigator: webShare(false).navigator })
    w(p).erpShare(bytes(1, 2), 'Hợp đồng.docx', DOCX)
    click(p, 'Tải bản sao xuống')
    expect(p.dialog()).toBeNull()
    expect(p.office.calls).toEqual([])
  })

  it('a format the server does not store stays with Web Share, as before', () => {
    const share = webShare(false)
    const p = page({ ...local, navigator: share.navigator })
    expect(w(p).erpShare(bytes(1), 'Dự toán.xlsm', 'application/vnd.ms-excel.sheet.macroEnabled.12')).toBe(false)
    expect(p.dialog()).toBeNull()
  })

  it('copies the bytes, so a fork reusing its buffer after the call changes nothing', async () => {
    const p = page(local)
    const given = bytes(1, 2, 3)
    w(p).erpShare(given, 'Hợp đồng.docx', DOCX)
    given.fill(0)
    click(p, 'Lưu lên Tài liệu của tôi và chia sẻ')
    await p.settle()
    const stored = [...p.office.docs.values()].find(d => d.title === 'Hợp đồng')!
    expect(Array.from(stored.versions[0])).toEqual([1, 2, 3])
  })
})

describe('sameDocument', () => {
  const same = (p: Page) => (p.window as unknown as { erpOnline: { sameDocument(n: string, t: string, f: string): boolean } }).erpOnline.sameDocument
  it('matches the names the forks give a titled document, and nothing else', () => {
    const s = same(page(local))
    expect(s('Báo cáo quý.docx', 'Báo cáo quý', 'docx')).toBe(true)
    expect(s('báo cáo quý.DOCX', 'Báo cáo quý.docx', 'docx')).toBe(true)
    expect(s('Q1-Báo cáo.xlsx', 'Q1/Báo cáo', 'xlsx')).toBe(true)
    expect(s('Báo cáo.xlsx', 'Q1/Báo cáo', 'xlsx')).toBe(true)
    expect(s('Hợp đồng.docx', 'Báo cáo quý', 'docx')).toBe(false)
    expect(s('.docx', '', 'docx')).toBe(false)
  })
})
