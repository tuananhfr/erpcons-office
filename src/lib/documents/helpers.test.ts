import { describe, expect, it } from 'vitest'
import { EDITORS } from '../../config/editors.ts'
import { INTAKE_LIMITS } from '../files/intake-contract.ts'
import { formatBytes, formatUpdated, trashDaysLeft, trashNote } from './display.ts'
import { KINDS, documentUrl } from './formats.ts'
import { createIdempotency, randomKey } from './idempotency.ts'
import { nameError, normalizeName } from './names.ts'
import { quotaLevel, quotaPercent, quotaSummary } from './quota.ts'
import { ROOT_VIEW, parseView, viewHash, viewState } from './route.ts'
import { checkUpload, maxUploadBytes } from './upload-check.ts'

const ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0])
const PDF = new TextEncoder().encode('%PDF-1.7\n')
const MB = 1024 * 1024

describe('formats', () => {
  it('opens each format in the editor that takes it, at /<editor>/?doc=<id>', () => {
    expect(documentUrl({ id: ID, format: 'docx' })).toBe(`/van-ban/?doc=${ID}`)
    expect(documentUrl({ id: ID, format: 'xlsx' })).toBe(`/bang-tinh/?doc=${ID}`)
    expect(documentUrl({ id: ID, format: 'pptx' })).toBe(`/trinh-chieu/?doc=${ID}`)
    expect(documentUrl({ id: ID, format: 'pdf' })).toBe(`/pdf/?doc=${ID}`)
    for (const info of KINDS) expect(EDITORS.find((e) => e.slug === info.editor)?.accepts).toContain(info.format)
  })

  it('offers the four kinds of the API, with the server default titles', () => {
    expect(KINDS.map((k) => [k.kind, k.defaultTitle])).toEqual([
      ['word', 'Văn bản không tên'], ['sheet', 'Bảng tính không tên'], ['slide', 'Trình chiếu không tên'], ['pdf', 'PDF không tên'],
    ])
  })
})

describe('names', () => {
  it('follows the server Name rules', () => {
    expect(nameError('   ')).toBe('empty')
    expect(nameError('a'.repeat(255))).toBeNull()
    expect(nameError('a'.repeat(256))).toBe('tooLong')
    expect(nameError('Hồ sơ/2026')).toBe('forbidden')
    expect(nameError('Hồ sơ\\2026')).toBe('forbidden')
    expect(nameError(`Báo cáo${String.fromCharCode(0x202e)}fdp`)).toBe('forbidden')
    expect(nameError(`a${String.fromCharCode(9)}b`)).toBe('forbidden')
    expect(nameError('Hợp đồng thi công nhà xưởng')).toBeNull()
  })

  it('counts characters, not UTF-16 units, and trims to NFC', () => {
    expect(nameError('😀'.repeat(255))).toBeNull()
    expect(normalizeName(`  Ho${String.fromCharCode(0x31b, 0x323)}p `)).toBe('H' + String.fromCharCode(0x1ee3) + 'p')
  })
})

describe('display', () => {
  it('formats sizes the Vietnamese way', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(5 * 1024 * MB)).toBe('5 GB')
    expect(formatBytes(150 * MB)).toBe('150 MB')
  })

  it('says today and yesterday, otherwise the date', () => {
    const now = new Date(2026, 9, 28, 10, 0)
    expect(formatUpdated(new Date(2026, 9, 28, 8, 5).toISOString(), now)).toBe('Hôm nay, 08:05')
    expect(formatUpdated(new Date(2026, 9, 27, 21, 30).toISOString(), now)).toBe('Hôm qua, 21:30')
    expect(formatUpdated(new Date(2026, 8, 3, 12, 0).toISOString(), now)).toBe('03/09/2026')
    expect(formatUpdated('not a date', now)).toBe('')
  })

  it('counts the days left of the 30-day trash', () => {
    const now = Date.UTC(2026, 9, 28)
    expect(trashDaysLeft(new Date(now).toISOString(), now)).toBe(30)
    expect(trashDaysLeft(new Date(now - 29.5 * 86400000).toISOString(), now)).toBe(1)
    expect(trashDaysLeft(new Date(now - 40 * 86400000).toISOString(), now)).toBe(0)
    expect(trashNote(12)).toBe('Tự xoá hẳn sau 12 ngày')
    expect(trashNote(0)).toBe('Sắp bị xoá hẳn')
  })
})

describe('quota', () => {
  it('warns from 90% and is full at the limit', () => {
    expect(quotaLevel({ usedBytes: 10, limitBytes: 100, maxFileBytes: 1 })).toBe('ok')
    expect(quotaLevel({ usedBytes: 90, limitBytes: 100, maxFileBytes: 1 })).toBe('near')
    expect(quotaLevel({ usedBytes: 100, limitBytes: 100, maxFileBytes: 1 })).toBe('full')
    expect(quotaPercent({ usedBytes: 1, limitBytes: 3, maxFileBytes: 1 })).toBe(33.3)
    expect(quotaSummary({ usedBytes: 4.6 * 1024 * MB, limitBytes: 5 * 1024 * MB, maxFileBytes: 1 })).toBe('Đã dùng 4,6 GB / 5 GB')
  })
})

describe('upload check', () => {
  const quota = { usedBytes: 0, limitBytes: 1024 * MB, maxFileBytes: 50 * MB }

  it('takes only the four online formats, checked by signature', () => {
    expect(checkUpload('Báo cáo.docx', 10, ZIP, quota)).toBeNull()
    expect(checkUpload('Bản vẽ.PDF', 10, PDF, quota)).toBeNull()
    expect(checkUpload('cũ.doc', 10, ZIP, quota)?.reason).toBe('unsupported')
    expect(checkUpload('ghi chú.txt', 10, ZIP, quota)?.reason).toBe('unsupported')
    expect(checkUpload('giả.pdf', 10, ZIP, quota)?.reason).toBe('signature')
    expect(checkUpload('rỗng.xlsx', 0, new Uint8Array(), quota)?.reason).toBe('empty')
  })

  it('uses the lower of the intake limit and the server per-file limit', () => {
    expect(maxUploadBytes(null)).toBe(INTAKE_LIMITS.maxFileBytes)
    expect(maxUploadBytes(quota)).toBe(50 * MB)
    expect(maxUploadBytes({ ...quota, maxFileBytes: 500 * MB })).toBe(INTAKE_LIMITS.maxFileBytes)
    expect(checkUpload('lớn.pptx', 51 * MB, ZIP, quota)).toEqual({ reason: 'tooLarge', message: 'Tệp vượt quá 50 MB, giới hạn của mỗi tài liệu online.' })
  })

  it('refuses a file that would overflow the quota before sending it', () => {
    const almost = { ...quota, usedBytes: 1024 * MB - 2 * MB }
    expect(checkUpload('vừa.pdf', MB, PDF, almost)).toBeNull()
    expect(checkUpload('quá.pdf', 3 * MB, PDF, almost)).toEqual({ reason: 'quota', message: 'Không đủ dung lượng: chỉ còn trống 2 MB.' })
  })
})

describe('idempotency', () => {
  it('reuses the key for a retry of the same body and makes a new one for another body or after an answer', () => {
    let n = 0
    const keys = createIdempotency(() => `k${++n}`)
    expect(keys.keyFor({ name: 'A' })).toBe('k1')
    expect(keys.keyFor({ name: 'A' })).toBe('k1')
    expect(keys.keyFor({ name: 'B' })).toBe('k2')
    keys.reset()
    expect(keys.keyFor({ name: 'B' })).toBe('k3')
  })

  it('makes random UUID v4 keys by default, without needing a secure context', () => {
    const key = createIdempotency().keyFor({})
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(randomKey()).not.toBe(randomKey())
  })
})

describe('route', () => {
  it('keeps the place in the fragment, so it never reaches a server log', () => {
    expect(viewHash(ROOT_VIEW)).toBe('')
    expect(viewHash({ kind: 'trash' })).toBe('#thung-rac')
    expect(viewHash({ kind: 'folder', folderId: ID, trail: [] })).toBe(`#thu-muc=${ID}`)
  })

  it('reads the trail from history.state only when it ends at the folder in the URL', () => {
    const trail = [{ id: ID, name: 'Hợp đồng' }]
    const state = viewState({ kind: 'folder', folderId: ID, trail }, { __NA: true })
    expect(state.__NA).toBe(true)
    expect(parseView(`#thu-muc=${ID}`, state)).toEqual({ kind: 'folder', folderId: ID, trail })
    expect(parseView(`#thu-muc=${ID}`, null)).toEqual({ kind: 'folder', folderId: ID, trail: [] })
    expect(parseView(`#thu-muc=${ID}`, { erpDocs: { trail: [{ id: 'other', name: 'x' }] } })).toEqual({ kind: 'folder', folderId: ID, trail: [] })
    expect(parseView('#thung-rac', null)).toEqual({ kind: 'trash' })
    expect(parseView('#thu-muc=../../x', null)).toEqual(ROOT_VIEW)
    expect(parseView('', null)).toEqual(ROOT_VIEW)
  })
})
