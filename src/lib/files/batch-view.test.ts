import { describe, expect, it } from 'vitest'
import { FakeIdb } from '../../../editor-shell/fake-idb.ts'
import { batchView, formatSize, openHref } from './batch-view.ts'
import type { IntakeRecord } from './intake-contract.ts'
import { deleteBatch, markRouted, readBatch } from './intake-store.ts'

const NOW = Date.UTC(2026, 9, 26, 9)
const file = new Blob(['x'])
const record = (fields: Partial<IntakeRecord> & { id: string; name: string }): IntakeRecord => ({
  batchId: 'b1', expiresAt: NOW + 1000, state: 'READY', file, size: 2048, ...fields,
})

describe('batchView', () => {
  const mixed = [
    record({ id: 'a', name: 'Hợp đồng.docx', editor: 'van-ban', position: 0 }),
    record({ id: 'b', name: 'anh.jpg', state: 'FAILED_FINAL', errorCode: 'UNSUPPORTED_TYPE', reason: 'unsupported', file: undefined, position: 1 }),
    record({ id: 'c', name: 'Biên bản.docx', editor: 'van-ban', state: 'ROUTED', position: 2 }),
    record({ id: 'd', name: 'Bảng lương.xlsx', editor: 'bang-tinh', state: 'DELIVERED', position: 3 }),
    record({ id: 'e', name: 'trong.pdf', editor: 'pdf', state: 'FAILED_FINAL', errorCode: 'INVALID_SIGNATURE', reason: 'empty', file: undefined, size: 0, position: 4 }),
    record({ id: 'f', name: 'hong.pdf', editor: 'pdf', state: 'FAILED_RETRYABLE', errorCode: 'OFFLINE_DEPENDENCY', reason: 'notReady', position: 5 }),
  ]

  it('groups files by the editor that opens them, in landing order, and offers what is left to open', () => {
    const view = batchView(mixed, NOW)
    expect(view.status).toBe('active')
    expect(view.total).toBe(6)
    expect(view.groups.map((g) => [g.editor, g.rows.map((r) => r.id), g.openIds, g.openHref, g.openLabel])).toEqual([
      ['van-ban', ['a', 'c'], ['a', 'c'], '/van-ban/?open=a,c', 'Mở 2 tệp trong Văn bản'],
      ['bang-tinh', ['d'], [], null, 'Mở 0 tệp trong Bảng tính'],
      ['pdf', ['f'], [], null, 'Mở 0 tệp trong PDF'],
    ])
    expect(view.refused.map((r) => [r.name, r.state, r.detail])).toEqual([
      ['anh.jpg', 'Bị từ chối', 'Văn phòng chưa mở được loại tệp này. Hãy chọn tệp văn bản, bảng tính, trình chiếu hoặc PDF. (Mã: UNSUPPORTED_TYPE)'],
      ['trong.pdf', 'Bị từ chối', 'Tệp đang trống. (Mã: INVALID_SIGNATURE)'],
    ])
  })

  it('names each state, and offers "Thử lại" only where a retry can work', () => {
    const view = batchView(mixed, NOW)
    const rows = Object.fromEntries([...view.groups.flatMap((g) => g.rows), ...view.refused].map((r) => [r.id, r]))
    expect(rows.a).toMatchObject({ tone: 'ready', state: 'Sẵn sàng', type: 'DOCX', size: '2 KB' })
    expect(rows.c).toMatchObject({ tone: 'progress', state: 'Đã gửi, chờ công cụ nhận' })
    expect(rows.d).toMatchObject({ tone: 'done', state: 'Đã chuyển vào công cụ' })
    expect(rows.e).toMatchObject({ tone: 'error', state: 'Bị từ chối', size: '0 B' })
    expect(rows.e.detail).toContain('(Mã: INVALID_SIGNATURE)')
    expect(rows.f).toMatchObject({ tone: 'warn', state: 'Chưa chuyển được', retryHref: '/pdf/?open=f' })
    expect(Object.values(rows).filter((r) => r.retryHref).map((r) => r.id)).toEqual(['f'])
  })

  it('reports opened and parser failures from the editor', () => {
    const view = batchView([
      record({ id: 'a', name: 'a.docx', editor: 'van-ban', state: 'OPENED', file: undefined }),
      record({ id: 'b', name: 'b.docx', editor: 'van-ban', state: 'FAILED_FINAL', reason: 'parserFailed', errorCode: 'PARSER_FAILED', file: undefined }),
    ], NOW)
    expect(view.groups[0].rows.map((r) => [r.state, r.tone])).toEqual([['Đã mở', 'done'], ['Không mở được', 'error']])
    expect(view.groups[0].openHref).toBeNull()
  })

  it('shows expired rows and calls the batch expired once nothing is left', () => {
    const partly = batchView([record({ id: 'a', name: 'a.docx', editor: 'van-ban' }), record({ id: 'b', name: 'b.docx', editor: 'van-ban', expiresAt: NOW - 1 })], NOW)
    expect(partly.groups[0].rows.map((r) => r.state)).toEqual(['Sẵn sàng', 'Hết hạn'])
    expect(partly.groups[0].openIds).toEqual(['a'])
    expect(batchView([record({ id: 'a', name: 'a.docx', editor: 'van-ban', expiresAt: NOW - 1 })], NOW).status).toBe('expired')
    expect(batchView([], NOW).status).toBe('missing')
  })

  it('shows names without bidi controls', () => {
    const view = batchView([record({ id: 'a', name: 'hoa-don\u202efdp.exe.docx', editor: 'van-ban' })], NOW)
    expect(view.groups[0].rows[0].name).toBe('hoa-donfdp.exe.docx')
  })

  it('formats sizes the Vietnamese way', () => {
    expect([formatSize(512), formatSize(1536), formatSize(95.4 * 1024 * 1024)]).toEqual(['512 B', '1,5 KB', '95,4 MB'])
    expect(openHref('pdf', ['a b', 'c'])).toBe('/pdf/?open=a%20b,c')
  })
})

describe('intake store (the page side of the queue)', () => {
  async function seeded(rows: Record<string, unknown>[]) {
    const idb = new FakeIdb()
    await readBatch('none', idb as unknown as IDBFactory)
    for (const row of rows) idb.seed('pending', row)
    return idb
  }

  it('reads one batch in share order', async () => {
    const idb = await seeded([
      { id: 'z', batchId: 'b1', name: 'second', position: 1, createdAt: 5 },
      { id: 'y', batchId: 'b2', name: 'other', position: 0, createdAt: 5 },
      { id: 'x', batchId: 'b1', name: 'first', position: 0, createdAt: 5 },
    ])
    expect((await readBatch('b1', idb as unknown as IDBFactory)).map((r) => r.name)).toEqual(['first', 'second'])
  })

  it('marks READY entries ROUTED but never downgrades what the editor wrote', async () => {
    const idb = await seeded([{ id: 'a', state: 'READY' }, { id: 'b', state: 'DELIVERED' }, { id: 'c', state: 'OPENED' }])
    await markRouted(['a', 'b', 'c', 'missing'], idb as unknown as IDBFactory)
    expect(idb.rows('pending').map((r) => [r.id, r.state])).toEqual([['a', 'ROUTED'], ['b', 'DELIVERED'], ['c', 'OPENED']])
  })

  it('cancels a batch by deleting only its records', async () => {
    const idb = await seeded([{ id: 'a', batchId: 'b1' }, { id: 'b', batchId: 'b1' }, { id: 'c', batchId: 'b2' }])
    await deleteBatch('b1', idb as unknown as IDBFactory)
    expect(idb.rows('pending').map((r) => r.id)).toEqual(['c'])
  })

  it('deletes expired entries of other batches on read and keeps its own expired rows once, without bytes', async () => {
    const idb = await seeded([
      { id: 'mine', batchId: 'b1', name: 'a.pdf', expiresAt: 10, file: new Blob(['x']) },
      { id: 'other', batchId: 'b2', name: 'b.pdf', expiresAt: 10, file: new Blob(['x']) },
      { id: 'live', batchId: 'b3', name: 'c.pdf', expiresAt: 1000, file: new Blob(['x']) },
    ])
    const rows = await readBatch('b1', idb as unknown as IDBFactory, 500)
    expect(rows.map((r) => [r.id, Boolean(r.file)])).toEqual([['mine', false]])
    expect(idb.rows('pending').map((r) => [r.id, 'file' in r])).toEqual([['mine', false], ['live', true]])
  })

  it('rejects when storage cannot be opened', async () => {
    const idb = Object.assign(new FakeIdb(), { failOpen: true })
    await expect(readBatch('b1', idb as unknown as IDBFactory)).rejects.toBeDefined()
  })
})
