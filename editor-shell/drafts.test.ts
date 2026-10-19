import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
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
    window, location: { pathname, search }, URLSearchParams, Date, Math, Promise, Uint8Array, setTimeout,
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
