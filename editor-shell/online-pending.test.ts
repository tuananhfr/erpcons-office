import { describe, expect, it } from 'vitest'
import { FakeIdb } from './fake-idb.ts'
import { DOC_ID } from './fake-office.ts'
import { onlinePage } from './online-harness.ts'

interface PendingRecord { docId: string; sub: string; title: string; format: string; folderId?: string | null; baseVersion: number; baseEtag: string; savedAt: number; bytes: Uint8Array }
interface Store { put(record: PendingRecord): Promise<void>; get(id: string): Promise<(PendingRecord & { v: number; size: number }) | null>; remove(id: string): Promise<void> }

function store(idb: FakeIdb | null) {
  const page = onlinePage({ scripts: ['online-pending.js'] })
  return (page.window.erpOnline as { createPendingStore(idb: unknown): Store }).createPendingStore(idb)
}
const record = (over: Partial<PendingRecord> = {}): PendingRecord => ({
  docId: DOC_ID, sub: 'usr_an', title: 'Báo cáo quý', format: 'docx', baseVersion: 3, baseEtag: '"e3"', savedAt: 1_793_000_000_000, bytes: new Uint8Array([1, 2]), ...over,
})

describe('online pending store', () => {
  it('keeps one copy per document, replaced by the newest, until removed', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record())
    await pending.put(record({ bytes: new Uint8Array([3]), baseVersion: 4, baseEtag: '"e4"' }))
    const stored = await pending.get(DOC_ID)
    expect(stored).toMatchObject({ v: 1, docId: DOC_ID, baseVersion: 4, baseEtag: '"e4"', size: 1, folderId: null })
    expect([...stored!.bytes]).toEqual([3])
    expect(idb.rows('pending')).toHaveLength(1)
    await pending.remove(DOC_ID)
    expect(await pending.get(DOC_ID)).toBeNull()
  })

  it('ignores a damaged or foreign-shaped record instead of offering it', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.put(record())
    const row = idb.stores.get('pending')!.rows.get(DOC_ID)!
    row.size = 99
    expect(await pending.get(DOC_ID)).toBeNull()
  })

  it('without IndexedDB, or when it fails to open, rejects writes and finds nothing', async () => {
    const none = store(null)
    await expect(none.put(record())).rejects.toBeDefined()
    expect(await none.get(DOC_ID)).toBeNull()
    const broken = new FakeIdb()
    broken.failOpen = true
    expect(await store(broken).get(DOC_ID)).toBeNull()
  })

  it('a quota error on write rejects, so the save goes on without its crash copy', async () => {
    const idb = new FakeIdb()
    const pending = store(idb)
    await pending.get(DOC_ID)
    idb.failWrites = 'QuotaExceededError'
    await expect(pending.put(record())).rejects.toMatchObject({ name: 'QuotaExceededError' })
  })
})
