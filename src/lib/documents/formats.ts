import { EDITORS, editorPath, type EditorSlug } from '../../config/editors.ts'
import type { DocumentItem, Format, Kind } from './types.ts'

export interface KindInfo {
  kind: Kind
  format: Format
  editor: EditorSlug
  /** Name of the new-document choice, e.g. "Văn bản". */
  label: string
  /** Title the dialog suggests; the same defaults the server uses for a blank document. */
  defaultTitle: string
}

export const KINDS: readonly KindInfo[] = [
  { kind: 'word', format: 'docx', editor: 'van-ban', label: 'Văn bản', defaultTitle: 'Văn bản không tên' },
  { kind: 'sheet', format: 'xlsx', editor: 'bang-tinh', label: 'Bảng tính', defaultTitle: 'Bảng tính không tên' },
  { kind: 'slide', format: 'pptx', editor: 'trinh-chieu', label: 'Trình chiếu', defaultTitle: 'Trình chiếu không tên' },
  { kind: 'pdf', format: 'pdf', editor: 'pdf', label: 'PDF', defaultTitle: 'PDF không tên' },
]

/** Formats the server stores in phase 1; uploads of anything else are refused before sending. */
export const ONLINE_FORMATS: readonly Format[] = KINDS.map((info) => info.format)

export function kindInfo(format: Format): KindInfo {
  const info = KINDS.find((entry) => entry.format === format)
  if (!info) throw new Error(`no editor for format ${format}`)
  return info
}

// The editor is picked by format and must really open it, so a registry change cannot route a file to the wrong tool.
for (const info of KINDS) {
  if (!EDITORS.find((editor) => editor.slug === info.editor)?.accepts.includes(info.format)) {
    throw new Error(`${info.editor} does not open .${info.format}`)
  }
}

/** Where the shell opens an online document (editor-shell/online.js). */
export function documentUrl(doc: Pick<DocumentItem, 'id' | 'format'>): string {
  return `${editorPath(kindInfo(doc.format).editor)}?doc=${encodeURIComponent(doc.id)}`
}
