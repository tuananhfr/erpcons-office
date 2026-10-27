import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { intakeContractScript, intakeMessage } from '../src/lib/files/intake-contract.ts'
import { FakeIdb } from './fake-idb.ts'

const read = (name: string) => fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')
const script = read('open-file.js')
const intakeScript = read('intake.js')
// Fake IndexedDB answers over a few zero-delay macrotasks; a fixed delay alone loses that race on a loaded machine,
// so also queue behind enough zero-delay hops for every chain to settle.
const flush = async () => {
  await new Promise(resolve => setTimeout(resolve, 30))
  for (let hop = 0; hop < 20; hop++) await new Promise(resolve => setTimeout(resolve, 0))
}
const HOUR = 60 * 60 * 1000

interface Banner { textContent: string; role: string; links: { href: string; textContent: string }[]; removed: boolean }
interface Drop { init: { dataTransfer: { files: File[] } } }

// One editor page: intake contract, intake.js and open-file.js in a realm whose global is `window`, with manual timers.
function page({ search = '', path = '/van-ban/', idb = new FakeIdb(), launch = null as File[] | null, withIntake = true } = {}) {
  let now = Date.UTC(2026, 9, 26, 9)
  let next = 0
  const intervals = new Map<number, () => void>()
  const timeouts: { at: number; fn: () => void }[] = []
  let handled = false
  const drops: Drop[] = []
  const banners: Banner[] = []
  const replaced: string[] = []
  let consumer: ((params: { files: { getFile: () => Promise<File> }[] }) => void) | null = null
  const context: Record<string, unknown> = {
    URLSearchParams, URL, Promise, Uint8Array, File,
    Date: { now: () => now },
    indexedDB: idb,
    navigator: { gpu: {} },
    location: { search, pathname: path, href: 'https://office.erpcons.ai' + path + search, hash: '' },
    document: {
      createElement: (tag: string) => {
        if (tag === 'a' || tag === 'button') return { href: '', textContent: '', type: '', onclick: null as null | (() => void) }
        const banner: Banner & Record<string, unknown> = {
          textContent: '', role: '', links: [], removed: false, className: '',
          setAttribute(name: string, value: string) { if (name === 'role') banner.role = value },
          appendChild(child: { href: string; textContent: string }) { banner.links.push(child) },
          remove() { banner.removed = true },
        }
        banners.push(banner)
        return banner
      },
      body: { appendChild() {} },
      querySelector: () => ({ dispatchEvent(event: Drop) { drops.push(event); return !handled } }),
    },
    DataTransfer: class { files: unknown[] = []; items = { add: (file: unknown) => { this.files.push(file) } } },
    DragEvent: class { type: string; init: unknown; constructor(type: string, init: unknown) { this.type = type; this.init = init } },
    history: { replaceState: (_s: unknown, _t: string, url: string) => { replaced.push(url) } },
    setInterval: (fn: () => void) => { intervals.set(++next, fn); return next },
    clearInterval: (id: number) => { intervals.delete(id) },
    setTimeout: (fn: () => void, ms = 0) => { timeouts.push({ at: now + ms, fn }) },
    addEventListener() {},
  }
  if (launch) context.launchQueue = { setConsumer: (fn: typeof consumer) => { consumer = fn } }
  context.window = context
  vm.createContext(context)
  if (withIntake) {
    vm.runInContext(intakeContractScript('window'), context)
    vm.runInContext(intakeScript, context)
  }
  vm.runInContext(script, context)
  const banner = () => banners.at(-1)!
  return {
    idb, drops, banners, replaced, banner,
    get now() { return now },
    tick: () => [...intervals.values()].forEach(fn => fn()),
    live: () => intervals.size,
    ready: () => { handled = true },
    advance: (ms: number) => {
      now += ms
      timeouts.filter(t => t.at <= now).forEach(t => { timeouts.splice(timeouts.indexOf(t), 1); t.fn() })
    },
    result: (name: string, size: number, ok: boolean) => (context.erpIntakeResult as (n: string, s: number, o: boolean) => void)(name, size, ok),
    deliver: (files: { name: string }[], name: string, done?: () => void, cleanup?: (reason?: string) => void) =>
      (context.erpShellDeliver as (...args: unknown[]) => void)(files, name, done, cleanup),
    launch: async () => { consumer?.({ files: (launch ?? []).map(file => ({ getFile: async () => file })) }); await flush() },
    row: (id: string) => idb.rows('pending').find(row => row.id === id),
  }
}

const docx = (name: string, size = 6) => new File([new Uint8Array(size).fill(0x50)], name, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })

async function queued(rows: Record<string, unknown>[], options: { search: string; path?: string }) {
  const idb = new FakeIdb()
  // Create the store first, then seed it as the share target or the landing would.
  await new Promise<void>((resolve) => { const r = idb.open('erpcons-file-transfer-v1', 1); r.onupgradeneeded = () => r.result!.createObjectStore('pending', { keyPath: 'id' }); r.onsuccess = () => resolve() })
  const p = page({ idb, ...options })
  for (const row of rows) idb.seed('pending', { expiresAt: p.now + HOUR, editor: 'van-ban', state: 'READY', ...row })
  await flush()
  return p
}

describe('editor file handoff (?open=)', () => {
  it('waits for the real editor drop handler, keeps the bytes until the editor reports, then marks it opened', async () => {
    // A record written before the intake contract: no state, no size.
    const p = await queued([{ id: 'token', name: 'report.docx', file: docx('report.docx'), state: undefined }], { search: '?open=token' })
    p.tick()
    expect(p.row('token')?.file).toBeDefined()
    p.ready()
    p.tick()
    await flush()
    expect(p.drops).toHaveLength(2)
    expect(p.drops[1].init.dataTransfer.files.map(f => f.name)).toEqual(['report.docx'])
    expect(p.banner().textContent).toBe('Đã chuyển “report.docx” vào công cụ.')
    expect(p.row('token')).toMatchObject({ state: 'DELIVERED' })
    expect(p.row('token')?.file).toBeDefined()
    expect(p.replaced).toEqual(['/van-ban/'])
    p.result('report.docx', 6, true)
    await flush()
    expect(p.row('token')?.state).toBe('OPENED')
    expect(p.row('token')?.file).toBeUndefined()
    expect(p.banner().textContent).toBe('Đã mở “report.docx”.')
  })

  it('delivers several ids in one drop and reports the ones it left out', async () => {
    const p = await queued([
      { id: 'a', name: 'A.docx', file: docx('A.docx') },
      { id: 'b', name: 'B.docx', file: docx('B.docx'), expiresAt: 0 },
      { id: 'c', name: 'C.docx', file: docx('C.docx', 9) },
      { id: 'd', name: 'D.xlsx', file: docx('D.xlsx'), editor: 'bang-tinh' },
    ], { search: '?open=a,b,c,d,a' })
    expect(p.banner().textContent).toBe('Đang khởi tạo công cụ để nhận 2 tệp…')
    p.ready()
    p.tick()
    await flush()
    expect(p.drops).toHaveLength(1)
    expect(p.drops[0].init.dataTransfer.files.map(f => f.name)).toEqual(['A.docx', 'C.docx'])
    expect(p.banner().textContent).toBe(`Đã chuyển 2 tệp vào công cụ. “B.docx”: ${intakeMessage('expired')} “D.xlsx”: ${intakeMessage('wrongEditor')}`)
    expect(p.banner().role).toBe('alert')
    // The expired entry is pruned on the way.
    expect(['a', 'b', 'c', 'd'].map(id => p.row(id)?.state)).toEqual(['DELIVERED', undefined, 'DELIVERED', 'READY'])
    p.result('C.docx', 9, false)
    await flush()
    const left = `“B.docx”: ${intakeMessage('expired')} “D.xlsx”: ${intakeMessage('wrongEditor')}`
    expect(p.banner().textContent).toBe(`Đã mở 0/2 tệp; không mở được: C.docx. ${left}`)
    p.result('A.docx', 6, true)
    await flush()
    expect(p.banner().textContent).toBe(`Đã mở 1/2 tệp; không mở được: C.docx. ${left}`)
    expect(p.banner().role).toBe('alert')
    expect(p.row('c')).toMatchObject({ state: 'FAILED_FINAL', errorCode: 'PARSER_FAILED', reason: 'parserFailed', recoverable: false })
    expect(p.row('c')?.file).toBeUndefined()
    expect(p.row('a')?.state).toBe('OPENED')
  })

  it('ignores results for files it did not hand over (the user dragging their own copy)', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx') }], { search: '?open=a' })
    p.ready()
    p.tick()
    await flush()
    p.result('A.docx', 7, false)
    p.result('Other.docx', 6, false)
    await flush()
    expect(p.row('a')?.state).toBe('DELIVERED')
    p.result('A.docx', 6, true)
    p.result('A.docx', 6, false)
    await flush()
    expect(p.row('a')?.state).toBe('OPENED')
  })

  it('leaves the entry DELIVERED when an older editor build never reports back', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx') }], { search: '?open=a' })
    p.ready()
    p.tick()
    await flush()
    expect(p.row('a')?.file).toBeDefined()
    p.advance(121000)
    p.result('A.docx', 6, true)
    await flush()
    expect(p.row('a')?.state).toBe('DELIVERED')
    // Nobody will use these bytes any more; they must not wait an hour in IndexedDB.
    expect(p.row('a')?.file).toBeUndefined()
  })

  it('lets only one of two tabs opening the same link deliver it', async () => {
    const first = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx') }], { search: '?open=a' })
    const second = page({ idb: first.idb, search: '?open=a' })
    await flush()
    for (const tab of [first, second]) { tab.ready(); tab.tick() }
    await flush()
    const delivered = [first, second].filter(tab => tab.drops.length > 0)
    expect(delivered).toHaveLength(1)
    const other = delivered[0] === first ? second : first
    expect(other.banner().textContent).toBe('“A.docx” đang được mở ở một cửa sổ khác. ')
    expect(other.banner().role).toBe('status')
    // Nothing to re-pick: the files are fine, only a dismiss is offered.
    const actions = other.banner().links as unknown as { textContent: string; href: string; onclick: (() => void) | null }[]
    expect(actions.map(a => a.textContent)).toEqual(['Đóng'])
    actions[0].onclick!()
    expect(other.banner().removed).toBe(true)
    expect(first.row('a')).toMatchObject({ state: 'DELIVERED' })
    expect(first.row('a')?.claimedAt).toBeUndefined()
  })

  it('takes over a claim left by a tab that died mid-handoff', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx'), claimedAt: Date.UTC(2026, 9, 26, 9) - 150_001 }], { search: '?open=a' })
    p.ready()
    p.tick()
    await flush()
    expect(p.drops).toHaveLength(1)
  })

  it('drops expired entries of other batches when it reads the queue', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx') }, { id: 'old', name: 'Old.docx', file: docx('Old.docx'), expiresAt: 0 }], { search: '?open=a' })
    expect(p.row('old')).toBeUndefined()
  })

  it('does not hand the same intake id over twice', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx'), state: 'DELIVERED' }, { id: 'b', name: 'B.docx', state: 'OPENED' }], { search: '?open=a,b' })
    p.ready()
    p.tick()
    expect(p.drops).toHaveLength(0)
    expect(p.banner().textContent).toBe('“A.docx” đã được mở trước đó. “B.docx” đã được mở trước đó. ')
    expect(p.banner().links.map(l => l.href)).toEqual(['/'])
  })

  it('marks a handoff that timed out as retryable and keeps its bytes for "Thử lại"', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx') }], { search: '?open=a' })
    p.advance(120001)
    p.tick()
    await flush()
    expect(p.live()).toBe(0)
    expect(p.banner().textContent).toBe(intakeMessage('notReady') + ' ')
    expect(p.banner().links.map(l => [l.href, l.textContent])).toEqual([['/', 'Chọn lại tệp']])
    expect(p.row('a')).toMatchObject({ state: 'FAILED_RETRYABLE', errorCode: 'OFFLINE_DEPENDENCY', recoverable: true })
    expect(p.row('a')?.file).toBeDefined()
  })

  it('retries a FAILED_RETRYABLE entry', async () => {
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx'), state: 'FAILED_RETRYABLE', errorCode: 'OFFLINE_DEPENDENCY' }], { search: '?open=a' })
    p.ready()
    p.tick()
    await flush()
    expect(p.drops).toHaveLength(1)
    expect(p.row('a')).toMatchObject({ state: 'DELIVERED', errorCode: null, recoverable: false })
  })

  it.each([
    [{ path: '/pdf/' }, 'wrongEditor'],
    [{ expiresAt: 0 }, 'expired'],
    [{ id: 'other' }, 'expired'],
  ])('refuses an unavailable or misrouted entry alone with its message (%j)', async (change, reason) => {
    const { path, ...row } = change as { path?: string; expiresAt?: number; id?: string }
    const p = await queued([{ id: 'a', name: 'A.docx', file: docx('A.docx'), ...row }], { search: '?open=a', path })
    p.ready()
    p.tick()
    expect(p.drops).toHaveLength(0)
    expect(p.banner().textContent).toBe(intakeMessage(reason as 'expired') + ' ')
    expect(p.banner().role).toBe('alert')
  })

  it('gives a recovery path if the browser denies storage', async () => {
    const p = page({ search: '?open=a', idb: { open: () => { throw new Error('SecurityError') } } as unknown as FakeIdb })
    await flush()
    expect(p.banner().textContent).toContain('không cho phép lưu trữ')
    expect(p.banner().textContent).toContain('(Mã: SOURCE_UNAVAILABLE)')
    expect(p.drops).toHaveLength(0)
  })

  it('strips bidi controls from the names it shows, never from the file handed over', async () => {
    const name = 'h\u202efdp.exe.docx'
    const p = await queued([{ id: 'a', name, file: docx(name) }], { search: '?open=a' })
    p.ready()
    p.tick()
    await flush()
    expect(p.banner().textContent).toBe('Đã chuyển “hfdp.exe.docx” vào công cụ.')
    expect(p.drops[0].init.dataTransfer.files[0].name).toBe(name)
  })
})

describe('opening files from the operating system ("Open with")', () => {
  it('drops the launched files into the editor once it is ready and reports the results', async () => {
    const files = [docx('Báo cáo.docx'), docx('Biên bản.docx', 8)]
    const idb = new FakeIdb()
    const p = page({ launch: files, idb })
    await p.launch()
    p.tick()
    p.ready()
    p.tick()
    expect(p.drops).toHaveLength(2)
    expect(p.drops[1].init.dataTransfer.files.map(f => f.name)).toEqual(['Báo cáo.docx', 'Biên bản.docx'])
    p.result('Báo cáo.docx', 6, true)
    p.result('Biên bản.docx', 8, true)
    expect(p.banner().textContent).toBe('Đã mở 2/2 tệp.')
    expect(idb.stores.size).toBe(0)
  })

  it('ignores a plain app launch without files', async () => {
    const p = page({ launch: [] })
    await p.launch()
    p.tick()
    expect(p.drops).toHaveLength(0)
  })
})

describe('overlapping handoffs (an ERP page sending several files)', () => {
  it('drops each file once and stops every timer, without the intake contract loaded', () => {
    const p = page({ withIntake: false })
    const done: string[] = []
    p.deliver([{ name: 'A.docx' }], 'A.docx', () => done.push('A'))
    p.deliver([{ name: 'B.docx' }], 'B.docx', () => done.push('B'))
    p.ready()
    p.tick()
    p.tick()
    expect(p.drops.map(drop => drop.init.dataTransfer.files)).toEqual([[{ name: 'A.docx' }], [{ name: 'B.docx' }]])
    expect(done).toEqual(['A', 'B'])
    expect(p.live()).toBe(0)
  })

  it('keeps a newer message up when an older one would hide the banner', () => {
    const p = page()
    p.ready()
    p.deliver([{ name: 'A.docx' }], 'A.docx')
    p.tick()
    p.deliver([{ name: 'B.docx' }], 'B.docx')
    p.advance(4500)
    expect(p.banners[0].removed).toBe(false)
    expect(p.banners[0].textContent).toContain('B.docx')
    p.tick()
    p.advance(4500)
    expect(p.banners[0].removed).toBe(true)
    p.deliver([{ name: 'C.docx' }], 'C.docx')
    expect(p.banners).toHaveLength(2)
    expect(p.banners[1].textContent).toContain('C.docx')
  })

  it('hands the failure reason to the caller cleanup', () => {
    const p = page()
    const reasons: (string | undefined)[] = []
    p.deliver([{ name: 'A.docx' }], 'A.docx', undefined, (reason) => reasons.push(reason))
    p.advance(120001)
    p.tick()
    expect(reasons).toEqual(['notReady'])
  })
})
