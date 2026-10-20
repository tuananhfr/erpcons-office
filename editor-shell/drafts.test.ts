import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import zlib from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeIdb } from './fake-idb.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'drafts.js'), 'utf8')
const DAY = 24 * 3600 * 1000

interface Status { kind: string; at?: number; name?: string }
interface Orphan { id: string; name: string; format: string; size: number; savedAt: number; corrupt: boolean }
interface Store {
  tab: string
  subscribe(fn: (status: Status) => void): void
  onReady(fn: () => void): void
  orphans(): Promise<Orphan[]>
  restore(id: string): Promise<string>
  discard(id: string): Promise<void>
}
interface Drafts {
  put(key: string, name: string, format: string, bytes: Uint8Array): void
  remove(key: string): void
  ready(restore: (...args: unknown[]) => void): void
}

// Fake IndexedDB answers over a few macrotasks; give every chain time to settle.
const flush = () => new Promise(resolve => setTimeout(resolve, 30))

function page(idb: FakeIdb, { pathname = '/van-ban/', search = '', locks = [] as string[] | null, storage = {} as Record<string, unknown> } = {}) {
  const held: string[] = []
  const window: Record<string, unknown> = {}
  const context = {
    window, location: { pathname, search }, URLSearchParams, Date, Math, Promise, Uint8Array, Uint32Array, setTimeout,
    indexedDB: idb,
    navigator: {
      storage,
      locks: locks && {
        request: (name: string, _hold: () => Promise<void>) => { held.push(name); return new Promise(() => {}) },
        query: async () => ({ held: [...locks, ...held].map(name => ({ name })), pending: [] }),
      },
    },
  }
  vm.runInNewContext(SOURCE, context)
  return { drafts: window.erpDrafts as Drafts | undefined, store: window.erpDraftStore as Store | undefined, held }
}

function bytes(...values: number[]) { return new Uint8Array(values) }

// Seeds the database as an earlier visit left it, without a page whose own start-up cleanup would race the test.
function seeded(idb: FakeIdb, row: Record<string, unknown>) {
  if (!idb.stores.has('drafts')) {
    idb.stores.set('drafts', { keyPath: 'id', rows: new Map() })
    idb.version = 1
  }
  idb.seed('drafts', { v: 1, editor: 'van-ban', format: 'docx', name: 'Old.docx', bytes: bytes(1, 2, 3), size: 3, crc: 1438416925, savedAt: Date.now(), ...row })
}

async function opened(idb = new FakeIdb(), options = {}) {
  const view = page(idb, options)
  await flush()
  return { ...view, idb }
}

describe('draft store', () => {
  it('stays off outside the four editors and in embedded mode', () => {
    expect(page(new FakeIdb(), { pathname: '/' }).drafts).toBeUndefined()
    expect(page(new FakeIdb(), { pathname: '/van-ban/khac/' }).drafts).toBeUndefined()
    expect(page(new FakeIdb(), { pathname: '/bang-tinh/', search: '?host=parent' }).drafts).toBeUndefined()
    expect(page(new FakeIdb(), { pathname: '/pdf/' }).drafts).toBeDefined()
  })

  it('does not install the draft store when embedded for ERP', () => {
    const embedded = page(new FakeIdb(), { pathname: '/van-ban/', search: '?embed=erpcons&parent=https%3A%2F%2Flpc.vn' })
    expect(embedded.drafts).toBeUndefined()
    expect(embedded.store).toBeUndefined()
  })

  it('holds a lock for its own tab so other tabs know it is alive', async () => {
    const { held, store } = await opened()
    expect(held).toEqual(['erpcons-draft-tab:' + store!.tab])
  })

  it('stores a draft with its checksum, owner tab and editor', async () => {
    const { drafts, store, idb } = await opened()
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1, 2, 3))
    await flush()
    const [row] = idb.rows()
    expect(row).toMatchObject({ v: 1, id: store!.tab + '|doc-1', editor: 'van-ban', tab: store!.tab, name: 'Report.docx', format: 'docx', size: 3, crc: 1438416925 })
    expect([...(row.bytes as Uint8Array)]).toEqual([1, 2, 3])
  })

  it('checksums long drafts the same as zlib, whatever their length past a multiple of 8', async () => {
    const { drafts, idb } = await opened()
    const long = new Uint8Array(100_003)
    for (let i = 0; i < long.length; i++) long[i] = (i * 2654435761) >>> 24
    for (const length of [8, 13, 100_003]) {
      drafts!.put('doc-' + length, 'Big.xlsx', 'xlsx', long.subarray(0, length))
    }
    await flush()
    const crcs = Object.fromEntries(idb.rows().map(row => [row.size, row.crc]))
    for (const length of [8, 13, 100_003]) expect(crcs[length]).toBe(zlib.crc32(long.subarray(0, length)))
  })

  it('keeps one record per document and replaces it on every put', async () => {
    const { drafts, idb } = await opened()
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1))
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1, 2))
    await flush()
    expect(idb.rows().map(row => row.size)).toEqual([2])
  })

  it('writes drafts handed over before the database opened', async () => {
    const idb = new FakeIdb()
    const { drafts } = page(idb)
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(9))
    await flush()
    await flush()
    expect(idb.rows()).toHaveLength(1)
  })

  it('reports the save, then goes quiet once every draft is removed', async () => {
    const { drafts, store } = await opened()
    const seen: string[] = []
    store!.subscribe(status => seen.push(status.kind))
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1))
    await flush()
    drafts!.remove('doc-1')
    await flush()
    expect(seen).toEqual(['saved', 'idle'])
  })

  it('removes the record when the editor says the document is saved or closed', async () => {
    const { drafts, idb } = await opened()
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1))
    drafts!.remove('doc-1')
    await flush()
    expect(idb.rows()).toEqual([])
  })

  it('keeps the previous draft and warns when the browser storage is full', async () => {
    const { drafts, store, idb } = await opened()
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1))
    await flush()
    const seen: Status[] = []
    store!.subscribe(status => seen.push(status))
    idb.failWrites = 'QuotaExceededError'
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1, 2, 3, 4))
    await flush()
    expect(seen.at(-1)).toMatchObject({ kind: 'quota', name: 'Report.docx' })
    expect(idb.rows().map(row => row.size)).toEqual([1])
  })

  it('says drafts cannot be kept when storage cannot be opened', async () => {
    const idb = new FakeIdb()
    idb.failOpen = true
    const { drafts, store } = page(idb)
    const seen: string[] = []
    store!.subscribe(status => seen.push(status.kind))
    await flush()
    drafts!.put('doc-1', 'Report.docx', 'docx', bytes(1))
    expect(seen).toEqual(['unavailable'])
  })

  it('asks the browser once to keep storage after the first draft', async () => {
    let asked = 0
    const { drafts } = await opened(new FakeIdb(), { storage: { persist: async () => { asked++; return true } } })
    drafts!.put('doc-1', 'A.docx', 'docx', bytes(1))
    drafts!.put('doc-2', 'B.docx', 'docx', bytes(1))
    await flush()
    expect(asked).toBe(1)
  })

  it('flags storage that is almost full', async () => {
    const { drafts, store } = await opened(new FakeIdb(), { storage: { estimate: async () => ({ usage: 95, quota: 100 }) } })
    const seen: string[] = []
    store!.subscribe(status => seen.push(status.kind))
    drafts!.put('doc-1', 'A.docx', 'docx', bytes(1))
    await flush()
    expect(seen).toEqual(['saved', 'nearFull'])
  })
})

describe('recovery', () => {
  it('offers drafts of closed tabs for this editor only, never those of a live tab', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone', name: 'Gone.docx' })
    seeded(idb, { id: 'alive|doc-1', tab: 'alive' })
    seeded(idb, { id: 'gone|doc-2', tab: 'gone', editor: 'bang-tinh' })
    const { store } = await opened(idb, { locks: ['erpcons-draft-tab:alive'] })
    const list = await store!.orphans()
    expect(list.map(item => item.id)).toEqual(['gone|doc-1'])
    expect(list[0]).toMatchObject({ name: 'Gone.docx', format: 'docx', size: 3, corrupt: false })
  })

  it('offers every other tab’s drafts when the browser cannot tell which tabs are alive', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'alive|doc-1', tab: 'alive' })
    const { store } = await opened(idb, { locks: null })
    expect((await store!.orphans()).map(item => item.id)).toEqual(['alive|doc-1'])
  })

  it('marks a draft whose bytes no longer match its checksum', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone', crc: 42 })
    const { store } = await opened(idb)
    expect((await store!.orphans())[0].corrupt).toBe(true)
  })

  it('only tells the page it is ready once the editor can open documents', async () => {
    const { drafts, store } = await opened()
    let ready = 0
    store!.onReady(() => ready++)
    await flush()
    expect(ready).toBe(0)
    drafts!.ready(() => {})
    await flush()
    expect(ready).toBe(1)
  })

  it('hands a restored draft to the editor and takes it over for this tab', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone', name: 'Gone.docx' })
    const { drafts, store } = await opened(idb)
    const calls: unknown[][] = []
    drafts!.ready((...args) => calls.push(args))
    expect(await store!.restore('gone|doc-1')).toBe('ok')
    expect(calls).toHaveLength(1)
    const [key, name, format, data] = calls[0] as [string, string, string, Uint8Array]
    expect([key, name, format, [...data]]).toEqual(['gone|doc-1', 'Gone.docx', 'docx', [1, 2, 3]])
    await flush()
    expect(idb.rows()[0].tab).toBe(store!.tab)
    expect(await store!.orphans()).toEqual([])

    drafts!.put('gone|doc-1', 'Gone.docx', 'docx', bytes(7, 7))
    await flush()
    expect(idb.rows().map(row => [row.id, row.size])).toEqual([['gone|doc-1', 2]])
  })

  it('opens a draft only once when restore is pressed twice', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone' })
    const { drafts, store } = await opened(idb)
    const calls: unknown[] = []
    drafts!.ready((...args) => calls.push(args))
    const results = await Promise.all([store!.restore('gone|doc-1'), store!.restore('gone|doc-1')])
    expect(results.sort()).toEqual(['missing', 'ok'])
    expect(calls).toHaveLength(1)
  })

  it('leaves alone a draft that another live tab has taken over since the list was shown', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'other' })
    const { drafts, store } = await opened(idb, { locks: ['erpcons-draft-tab:other'] })
    const calls: unknown[] = []
    drafts!.ready((...args) => calls.push(args))
    expect(await store!.restore('gone|doc-1')).toBe('missing')
    await store!.discard('gone|doc-1')
    expect(calls).toEqual([])
    expect(idb.rows().map(row => row.tab)).toEqual(['other'])
  })

  it('restarts the 30-day clock when a draft is taken over', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone', savedAt: Date.now() - 29 * DAY })
    const { drafts, store } = await opened(idb)
    drafts!.ready(() => {})
    await store!.restore('gone|doc-1')
    await flush()
    expect(Number(idb.rows()[0].savedAt)).toBeGreaterThan(Date.now() - 60000)
  })

  it('refuses to restore a damaged draft', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone', crc: 42 })
    const { drafts, store } = await opened(idb)
    const calls: unknown[] = []
    drafts!.ready((...args) => calls.push(args))
    expect(await store!.restore('gone|doc-1')).toBe('corrupt')
    expect(calls).toEqual([])
  })

  it('discards a draft the user does not want', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc-1', tab: 'gone' })
    const { store } = await opened(idb)
    await store!.discard('gone|doc-1')
    expect(idb.rows()).toEqual([])
  })

  it('deletes drafts of closed tabs after 30 days, but keeps newer ones and live tabs', async () => {
    const idb = new FakeIdb()
    const old = Date.now() - 31 * DAY
    seeded(idb, { id: 'gone|old', tab: 'gone', savedAt: old })
    seeded(idb, { id: 'gone|new', tab: 'gone', savedAt: Date.now() - 29 * DAY })
    seeded(idb, { id: 'alive|old', tab: 'alive', savedAt: old, editor: 'pdf' })
    await opened(idb, { locks: ['erpcons-draft-tab:alive'] })
    await vi.waitFor(() => expect(idb.rows().map(row => row.id).sort()).toEqual(['alive|old', 'gone|new']))
  })
})

describe('draft schema recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  async function settle<T>(operation: Promise<T>) {
    await vi.runAllTimersAsync()
    return operation
  }

  async function recoveryPage(idb: FakeIdb) {
    const view = page(idb)
    await vi.runAllTimersAsync()
    const restore = vi.fn()
    view.drafts!.ready(restore)
    return { store: view.store!, restore }
  }

  it.each(['current', 'legacy'])('restores a valid %s draft as version 1', async version => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc', tab: 'gone' })
    if (version === 'legacy') delete idb.stores.get('drafts')!.rows.get('gone|doc')!.v
    const { store, restore } = await recoveryPage(idb)
    expect((await settle(store.orphans()))[0].corrupt).toBe(false)
    expect(await settle(store.restore('gone|doc'))).toBe('ok')
    expect(restore).toHaveBeenCalledWith('gone|doc', 'Old.docx', 'docx', bytes(1, 2, 3))
    expect(idb.rows()[0]).toMatchObject({ v: 1, tab: store.tab })
  })

  it.each([2, 0, -1, 1.5, '1', null])('keeps an unsupported version %s without restoring it', async v => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc', tab: 'gone', v })
    const before = idb.rows()
    const { store, restore } = await recoveryPage(idb)
    expect((await settle(store.orphans()))[0].corrupt).toBe(true)
    expect(await settle(store.restore('gone|doc'))).toBe('corrupt')
    expect(restore).not.toHaveBeenCalled()
    expect(idb.rows()).toEqual(before)
  })

  it.each([
    { id: 42 }, { id: '' }, { tab: undefined }, { tab: 1 }, { editor: 'unknown' },
    { name: undefined }, { name: { text: 'Old.docx' } }, { format: null }, { format: '' },
    { savedAt: undefined }, { savedAt: NaN }, { savedAt: Infinity }, { savedAt: -1 },
    { savedAt: 1.5 }, { savedAt: 8640000000000001 },
    { size: '3' }, { size: -1 }, { size: 1.5 }, { size: Infinity }, { size: 4 },
    { crc: undefined }, { crc: '1438416925' }, { crc: -1 }, { crc: 0x100000000 }, { crc: 42 },
    { bytes: null }, { bytes: [1, 2, 3] }, { bytes: { length: 3 } }, { bytes: '{invalid JSON' },
  ])('skips malformed fields %j without modifying the record', async invalid => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|doc', tab: 'gone', ...invalid })
    const before = idb.rows()
    const { store, restore } = await recoveryPage(idb)
    expect((await settle(store.orphans()))[0].corrupt).toBe(true)
    expect(await settle(store.restore(String(before[0].id)))).toBe('corrupt')
    expect(restore).not.toHaveBeenCalled()
    expect(idb.rows()).toEqual(before)
  })

  it.each(['{invalid JSON', 'null', null, 42])('does not parse or throw on a corrupt stored value %j', async invalid => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|broken', tab: 'gone' })
    idb.stores.get('drafts')!.rows.set('gone|broken', invalid as unknown as Record<string, unknown>)
    const before = idb.rows()
    const { store, restore } = await recoveryPage(idb)
    expect((await settle(store.orphans()))[0].corrupt).toBe(true)
    expect(await settle(store.restore('gone|broken'))).toBe('corrupt')
    expect(restore).not.toHaveBeenCalled()
    expect(idb.rows()).toEqual(before)
  })

  it('keeps incompatible and corrupt drafts beyond the expiry cutoff', async () => {
    const idb = new FakeIdb()
    const savedAt = Date.now() - 31 * DAY
    seeded(idb, { id: 'gone|future', tab: 'gone', v: 2, savedAt })
    seeded(idb, { id: 'gone|broken', tab: 'gone', bytes: null, savedAt })
    seeded(idb, { id: 'gone|checksum', tab: 'gone', crc: 42, savedAt })
    seeded(idb, { id: 'gone|expired', tab: 'gone', savedAt })
    const { store } = await recoveryPage(idb)
    expect(idb.rows().map(row => row.id).sort()).toEqual(['gone|broken', 'gone|checksum', 'gone|future'])
    expect((await settle(store.orphans())).every(item => item.corrupt)).toBe(true)
  })

  it('continues restoring valid drafts after incompatible and corrupt ones', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|future', tab: 'gone', v: 2 })
    seeded(idb, { id: 'gone|current', tab: 'gone' })
    seeded(idb, { id: 'gone|broken', tab: 'gone', bytes: '{invalid JSON' })
    seeded(idb, { id: 'gone|legacy', tab: 'gone', v: undefined })
    const { store, restore } = await recoveryPage(idb)
    const results = []
    for (const id of ['gone|future', 'gone|current', 'gone|broken', 'gone|legacy']) {
      results.push(await settle(store.restore(id)))
    }
    expect(results).toEqual(['corrupt', 'ok', 'corrupt', 'ok'])
    expect(restore.mock.calls.map(call => call[0])).toEqual(['gone|current', 'gone|legacy'])
    expect((await settle(store.orphans())).map(item => item.id)).toEqual(['gone|future', 'gone|broken'])
    expect(idb.rows()).toHaveLength(4)
  })

  it('does not hand another editor or mismatched record id to the current editor', async () => {
    const idb = new FakeIdb()
    seeded(idb, { id: 'gone|other', tab: 'gone', editor: 'pdf' })
    seeded(idb, { id: 'gone|mismatch', tab: 'gone' })
    idb.stores.get('drafts')!.rows.get('gone|mismatch')!.id = 'gone|different'
    const before = idb.rows()
    const { store, restore } = await recoveryPage(idb)
    expect(await settle(store.restore('gone|other'))).toBe('corrupt')
    expect(await settle(store.restore('gone|mismatch'))).toBe('corrupt')
    expect(restore).not.toHaveBeenCalled()
    expect(idb.rows()).toEqual(before)
  })
})
