export type EditorSlug = 'van-ban' | 'bang-tinh' | 'trinh-chieu' | 'pdf'

export interface EditorEntry {
  slug: EditorSlug
  name: string
  extension: string
  /** Extensions (no dot) the editor really opens; the share target, "Open with", the landing picker and sw.js derive from it. */
  accepts: readonly string[]
  desktop: string
  fork: string
  webApp: string
  canvasId: string
  loadingId?: string
  upstreamName: string
  icon: string
  summary: string
  seoTitle: string
  seoDescription: string
}

export const SITE = {
  name: 'ERPCons Văn phòng',
  origin: 'https://office.erpcons.ai',
  description: 'Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt — miễn phí, không cần cài đặt, tệp không rời máy.',
} as const

export const EDITORS: readonly EditorEntry[] = [
  {
    slug: 'van-ban', desktop: 'VanBan', name: 'Văn bản', extension: '.docx', fork: 'wordcraft', webApp: 'apps/wordcraft-web',
    accepts: ['docx', 'docm', 'dotx', 'dotm', 'doc', 'dot', 'odt', 'rtf', 'txt', 'md'],
    canvasId: 'wordcraft_canvas', loadingId: 'wordcraft_loading', upstreamName: 'WordCraft', icon: 'file-earmark-word',
    summary: 'Mở, chỉnh sửa và lưu tệp Word (.docx).',
    seoTitle: 'Soạn thảo Word trực tuyến miễn phí',
    seoDescription: 'Mở, chỉnh sửa và lưu tệp .docx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'bang-tinh', desktop: 'BangTinh', name: 'Bảng tính', extension: '.xlsx', fork: 'gridcraft', webApp: 'apps/gridcraft-web',
    accepts: ['xlsx', 'xlsm', 'xls', 'xlsb', 'ods', 'csv', 'tsv'],
    canvasId: 'gridcraft_canvas', loadingId: 'gridcraft_loading', upstreamName: 'GridCraft', icon: 'file-earmark-spreadsheet',
    summary: 'Mở, chỉnh sửa và lưu bảng tính Excel (.xlsx).',
    seoTitle: 'Mở và sửa Excel trực tuyến miễn phí',
    seoDescription: 'Mở, chỉnh sửa và lưu bảng tính .xlsx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'trinh-chieu', desktop: 'TrinhChieu', name: 'Trình chiếu', extension: '.pptx', fork: 'deckcraft', webApp: 'apps/deckcraft-web',
    accepts: ['pptx', 'pptm', 'potx', 'ppsx'],
    canvasId: 'deckcraft_canvas', loadingId: 'deckcraft_loading', upstreamName: 'DeckCraft', icon: 'file-earmark-slides',
    summary: 'Mở, chỉnh sửa và lưu bài trình chiếu PowerPoint (.pptx).',
    seoTitle: 'Chỉnh sửa PowerPoint trực tuyến miễn phí',
    seoDescription: 'Mở, chỉnh sửa và lưu bài trình chiếu .pptx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'pdf', desktop: 'PDF', name: 'PDF', extension: '.pdf', fork: 'pdfcraft', webApp: 'apps/pdfcraft-web',
    accepts: ['pdf'],
    canvasId: 'pdfcraft', upstreamName: 'PdfCraft', icon: 'file-earmark-pdf',
    summary: 'Xem, ghi chú, sắp xếp trang, điền biểu mẫu và ký tệp PDF.',
    seoTitle: 'Xem và chỉnh sửa PDF trực tuyến miễn phí',
    seoDescription: 'Xem, ghi chú, gộp, tách, sắp xếp trang và điền biểu mẫu PDF ngay trên trình duyệt. Miễn phí, tệp không tải lên máy chủ.',
  },
]

export function editorPath(slug: EditorSlug): string {
  return `/${slug}/`
}

const CSS_IDENT = /^[A-Za-z][\w-]*$/

export function validateEditors(list: readonly EditorEntry[]): string[] {
  const problems: string[] = []
  const seen = { slug: new Set<string>(), canvasId: new Set<string>(), accepts: new Set<string>() }
  for (const editor of list) {
    for (const key of ['slug', 'canvasId'] as const) {
      if (seen[key].has(editor[key])) problems.push(`duplicate ${key}: ${editor[key]}`)
      seen[key].add(editor[key])
    }
    for (const id of [editor.canvasId, editor.loadingId]) {
      if (id !== undefined && !CSS_IDENT.test(id)) problems.push(`unsafe canvasId: ${id}`)
    }
    if (!editor.extension.startsWith('.')) problems.push(`extension must start with a dot: ${editor.extension}`)
    if (editor.extension.startsWith('.') && !editor.accepts.includes(editor.extension.slice(1))) problems.push(`${editor.slug} does not accept its own ${editor.extension}`)
    for (const ext of editor.accepts) {
      if (!/^[a-z0-9]+$/.test(ext)) problems.push(`accepted extension must be lower-case without a dot: ${ext}`)
      if (seen.accepts.has(ext)) problems.push(`two editors accept .${ext}`)
      seen.accepts.add(ext)
    }
  }
  return problems
}
