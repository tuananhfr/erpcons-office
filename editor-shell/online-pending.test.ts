import { describe, expect, it } from 'vitest'
import { FakeIdb } from './fake-idb.ts'
import { DOC_ID, OTHER_ID } from './fake-office.ts'
import { onlinePage } from './online-harness.ts'

interface PendingRecord { docId: string; sub: string; title: string; format: string; folderId?: string | null; baseVersion: number; baseEtag: string; role?: string | null; canDownload?: boolean; savedAt: number; bytes: Uint8Array }
type Stored = PendingRecord & { v: number; size: number }
interface Store {
  put(record: PendingRecord): Promise<void>
  get(sub: string, id: string): Promise<Stored | null>
  remove(sub: string, id: string): Promise<void>
  list(sub: string): Promise<Stored[]>
  removeAll(sub: string): Promise<void>
}

function store(idb: FakeIdb | null) {
  const page = onlinePage({ scripts: ['online-pending.js'] })
  return (page.window.erpOnline as { createPendingStore(idb: unknown): Store }).createPendingStore(idb)
}
const DAY = 24 * 60 * 60 * 1000
const record = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  docId: DOC_ID, sub: 'usr_an', title: 'Báo cáo quý', format: 'docx', baseVersion: 3, baseEtag: '"e3"', role: 'editor', canDownload: true,
  savedAt: Date.now() - 1000, bytes: new Uint8Array([1, 2]), ...over,
})

describe('online pending store', () => {
  it('keeps one copy per account and document, replaced by the newest, until removed', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record())
    await pending.put(record({ bytes: new Uint8Array([3]), baseVersion: 4, baseEtag: '"e4"' }))
    const stored = await pending.get('usr_an', DOC_ID)
    expect(stored).toMatchObject({ v: 2, docId: DOC_ID, sub: 'usr_an', baseVersion: 4, baseEtag: '"e4"', size: 1, folderId: null, role: 'editor', canDownload: true })
    expect([...stored!.bytes]).toEqual([3])
    expect(idb.rows('pending')).toHaveLength(1)
    await pending.remove('usr_an', DOC_ID)
    expect(await pending.get('usr_an', DOC_ID)).toBeNull()
  })

  it('two accounts on one device keep their own copy of the same document; neither sees or removes the other', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record({ bytes: new Uint8Array([1]) }))
    await pending.put(record({ sub: 'usr_binh', bytes: new Uint8Array([2]) }))
    expect(idb.rows('pending')).toHaveLength(2)
    expect([...(await pending.get('usr_an', DOC_ID))!.bytes]).toEqual([1])
    expect([...(await pending.get('usr_binh', DOC_ID))!.bytes]).toEqual([2])
    await pending.remove('usr_binh', DOC_ID)
    expect(await pending.get('usr_an', DOC_ID)).not.toBeNull()
    expect(await pending.get('usr_binh', DOC_ID)).toBeNull()
  })

  it('lists and removes one account\'s copies only', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record())
    await pending.put(record({ docId: OTHER_ID }))
    await pending.put(record({ sub: 'usr_binh' }))
    expect((await pending.list('usr_an')).map(r => r.docId).sort()).toEqual([DOC_ID, OTHER_ID].sort())
    await pending.removeAll('usr_an')
    expect(await pending.list('usr_an')).toEqual([])
    expect(idb.rows('pending').map(r => r.sub)).toEqual(['usr_binh'])
  })

  it('a copy older than 30 days is neither offered nor listed, and is deleted', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record({ savedAt: Date.now() - 31 * DAY }))
    await pending.put(record({ docId: OTHER_ID, savedAt: Date.now() - 29 * DAY }))
    expect(await pending.get('usr_an', DOC_ID)).toBeNull()
    expect((await pending.list('usr_an')).map(r => r.docId)).toEqual([OTHER_ID])
    expect(idb.rows('pending').map(r => r.docId)).toEqual([OTHER_ID])
  })

  it('moves version 1 records (keyed by document) to the account key, with no known role', async () => {
    const v1 = { v: 1, docId: DOC_ID, sub: 'usr_an', title: 'Báo cáo quý', format: 'docx', folderId: null, baseVersion: 3, baseEtag: '"e3"', savedAt: Date.now() - 1000, size: 2, bytes: new Uint8Array([1, 2]) }
    const idb = new FakeIdb().preset(1, { pending: { keyPath: 'docId', rows: [v1, { ...v1, docId: OTHER_ID, size: 9 }] } })
    const pending = store(idb)
    const moved = await pending.get('usr_an', DOC_ID)
    expect(moved).toMatchObject({ v: 2, docId: DOC_ID, sub: 'usr_an', role: null, canDownload: true, baseVersion: 3 })
    expect([...moved!.bytes]).toEqual([1, 2])
    expect(await pending.get('usr_binh', DOC_ID)).toBeNull()
    // The damaged one is not carried over.
    expect(idb.rows('pending')).toHaveLength(1)
    expect(idb.stores.get('pending')!.keyPath).toEqual(['sub', 'docId'])
  })

  it('ignores a damaged or foreign-shaped record instead of offering it', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record())
    const row = idb.stores.get('pending')!.rows.get(JSON.stringify(['usr_an', DOC_ID]))!
    row.size = 99
    expect(await pending.get('usr_an', DOC_ID)).toBeNull()
  })

  it('without IndexedDB, or when it fails to open, rejects writes and finds nothing', async () => {
    const none = store(null)
    await expect(none.put(record())).rejects.toBeDefined()
    expect(await none.get('usr_an', DOC_ID)).toBeNull()
    expect(await none.list('usr_an')).toEqual([])
    const broken = new FakeIdb()
    broken.failOpen = true
    expect(await store(broken).get('usr_an', DOC_ID)).toBeNull()
  })

  it('a quota error on write rejects, so the save goes on without its crash copy', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.get('usr_an', DOC_ID)
    idb.failWrites = 'QuotaExceededError'
    await expect(pending.put(record())).rejects.toMatchObject({ name: 'QuotaExceededError' })
  })
})
