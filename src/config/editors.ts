export type EditorSlug = 'van-ban' | 'bang-tinh' | 'trinh-chieu' | 'pdf'

export interface EditorEntry {
  slug: EditorSlug
  name: string
  extension: string
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
  origin: 'https://office.erpcons.vn',
  description: 'Soạn văn bản, bảng tính, trình chiếu và PDF ngay trên trình duyệt — miễn phí, không cần cài đặt, tệp không rời máy.',
} as const

export const EDITORS: readonly EditorEntry[] = [
  {
    slug: 'van-ban', name: 'Văn bản', extension: '.docx', fork: 'wordcraft', webApp: 'apps/wordcraft-web',
    canvasId: 'wordcraft_canvas', loadingId: 'wordcraft_loading', upstreamName: 'WordCraft', icon: 'file-earmark-word',
    summary: 'Mở, chỉnh sửa và lưu tệp Word (.docx).',
    seoTitle: 'Văn bản – soạn và sửa tệp Word (.docx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu tệp .docx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'bang-tinh', name: 'Bảng tính', extension: '.xlsx', fork: 'gridcraft', webApp: 'apps/gridcraft-web',
    canvasId: 'gridcraft_canvas', loadingId: 'gridcraft_loading', upstreamName: 'GridCraft', icon: 'file-earmark-spreadsheet',
    summary: 'Mở, chỉnh sửa và lưu bảng tính Excel (.xlsx).',
    seoTitle: 'Bảng tính – mở và sửa tệp Excel (.xlsx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu bảng tính .xlsx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'trinh-chieu', name: 'Trình chiếu', extension: '.pptx', fork: 'deckcraft', webApp: 'apps/deckcraft-web',
    canvasId: 'deckcraft_canvas', loadingId: 'deckcraft_loading', upstreamName: 'DeckCraft', icon: 'file-earmark-slides',
    summary: 'Mở, chỉnh sửa và lưu bài trình chiếu PowerPoint (.pptx).',
    seoTitle: 'Trình chiếu – mở và sửa tệp PowerPoint (.pptx) trực tuyến',
    seoDescription: 'Mở, chỉnh sửa và lưu bài trình chiếu .pptx ngay trên trình duyệt. Miễn phí, không cần tài khoản, tệp không tải lên máy chủ.',
  },
  {
    slug: 'pdf', name: 'PDF', extension: '.pdf', fork: 'pdfcraft', webApp: 'apps/pdfcraft-web',
    canvasId: 'pdfcraft', upstreamName: 'PdfCraft', icon: 'file-earmark-pdf',
    summary: 'Xem, ghi chú, sắp xếp trang, điền biểu mẫu và ký tệp PDF.',
    seoTitle: 'PDF – xem, sắp xếp trang và điền biểu mẫu PDF trực tuyến',
    seoDescription: 'Xem, ghi chú, gộp, tách, sắp xếp trang và điền biểu mẫu PDF ngay trên trình duyệt. Miễn phí, tệp không tải lên máy chủ.',
  },
]

export function editorPath(slug: EditorSlug): string {
  return `/${slug}/`
}

const CSS_IDENT = /^[A-Za-z][\w-]*$/

export function validateEditors(list: readonly EditorEntry[]): string[] {
  const problems: string[] = []
  const seen = { slug: new Set<string>(), canvasId: new Set<string>() }
  for (const editor of list) {
    for (const key of ['slug', 'canvasId'] as const) {
      if (seen[key].has(editor[key])) problems.push(`duplicate ${key}: ${editor[key]}`)
      seen[key].add(editor[key])
    }
    for (const id of [editor.canvasId, editor.loadingId]) {
      if (id !== undefined && !CSS_IDENT.test(id)) problems.push(`unsafe canvasId: ${id}`)
    }
    if (!editor.extension.startsWith('.')) problems.push(`extension must start with a dot: ${editor.extension}`)
  }
  return problems
}
