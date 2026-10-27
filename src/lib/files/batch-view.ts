import { EDITORS, editorPath, type EditorSlug } from '../../config/editors.ts'
import { displayName, extensionOf, intakeMessage, type IntakeRecord } from './intake-contract.ts'

export type RowTone = 'ready' | 'progress' | 'done' | 'warn' | 'error' | 'muted'

export interface BatchRow {
  id: string
  name: string
  type: string
  size: string
  tone: RowTone
  state: string
  /** Why it failed, with the support code; only on failed rows. */
  detail?: string
  retryHref?: string
}

export interface BatchGroup {
  editor: EditorSlug
  name: string
  icon: string
  rows: BatchRow[]
  openIds: string[]
  openHref: string | null
  openLabel: string
}

export interface BatchView {
  status: 'active' | 'expired' | 'missing'
  groups: BatchGroup[]
  /** Files no editor takes (wrong type): listed apart, nothing to open. */
  refused: BatchRow[]
  total: number
}

const sizeFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`
  return `${sizeFormat.format(bytes / 1024 / 1024)} MB`
}

export function openHref(editor: EditorSlug, ids: readonly string[]): string {
  return `${editorPath(editor)}?open=${ids.map(encodeURIComponent).join(',')}`
}

function expired(record: IntakeRecord, now: number): boolean {
  return record.expiresAt < now
}

function openable(record: IntakeRecord, now: number): boolean {
  return !expired(record, now) && Boolean(record.editor) && Boolean(record.file)
    && (record.state === undefined || record.state === 'READY' || record.state === 'ROUTED')
}

function rowOf(record: IntakeRecord, now: number): BatchRow {
  const ext = extensionOf(record.name)
  const base = {
    id: record.id,
    name: displayName(record.name),
    type: ext ? ext.toUpperCase() : 'Không rõ loại',
    size: formatSize(record.size ?? record.file?.size ?? 0),
  }
  const failure = record.reason ? intakeMessage(record.reason) : undefined
  if (expired(record, now) && record.state !== 'OPENED') return { ...base, tone: 'muted', state: 'Hết hạn' }
  switch (record.state) {
    case 'ROUTED': return { ...base, tone: 'progress', state: 'Đã gửi, chờ công cụ nhận' }
    case 'DELIVERED': return { ...base, tone: 'done', state: 'Đã chuyển vào công cụ' }
    case 'OPENED': return { ...base, tone: 'done', state: 'Đã mở' }
    case 'CANCELLED': return { ...base, tone: 'muted', state: 'Đã hủy' }
    case 'FAILED_RETRYABLE':
      return { ...base, tone: 'warn', state: 'Chưa chuyển được', detail: failure, retryHref: record.editor ? openHref(record.editor, [record.id]) : undefined }
    case 'FAILED_FINAL':
      return { ...base, tone: 'error', state: record.reason === 'parserFailed' ? 'Không mở được' : 'Bị từ chối', detail: failure }
    default: return { ...base, tone: 'ready', state: 'Sẵn sàng' }
  }
}

// Refused at intake (type, size, count, signature): never handed to a tool, so listed apart. A file the tool
// failed to open stays in its editor's group.
function refusedAtIntake(record: IntakeRecord): boolean {
  return record.state === 'FAILED_FINAL' && record.reason !== 'parserFailed'
}

/** What /nhan-tep/ shows for one share batch: rows grouped by suggested editor, with what is left to open. */
export function batchView(records: readonly IntakeRecord[], now = Date.now()): BatchView {
  if (!records.length) return { status: 'missing', groups: [], refused: [], total: 0 }
  const groups = EDITORS.flatMap((editor): BatchGroup[] => {
    const mine = records.filter((record) => record.editor === editor.slug && !refusedAtIntake(record))
    if (!mine.length) return []
    const openIds = mine.filter((record) => openable(record, now)).map((record) => record.id)
    return [{
      editor: editor.slug,
      name: editor.name,
      icon: editor.icon,
      rows: mine.map((record) => rowOf(record, now)),
      openIds,
      openHref: openIds.length ? openHref(editor.slug, openIds) : null,
      openLabel: `Mở ${openIds.length} tệp trong ${editor.name}`,
    }]
  })
  const known = new Set<string>(EDITORS.map((editor) => editor.slug))
  const refused = records.filter((record) => !record.editor || !known.has(record.editor) || refusedAtIntake(record)).map((record) => rowOf(record, now))
  const status = records.every((record) => expired(record, now) && record.state !== 'OPENED') ? 'expired' : 'active'
  return { status, groups, refused, total: records.length }
}
