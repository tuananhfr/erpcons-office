import type { Format } from './types.ts'

/** "Báo cáo (phiên bản 3).docx"; characters Windows refuses in a file name become "_". */
export function fileName(title: string, format: Format, version: number | null = null): string {
  const base = (title.trim() || 'Tài liệu').replace(/[\/:*?"<>|\u0000-\u001f]/g, '_')
  return `${base}${version === null ? '' : ` (phiên bản ${version})`}.${format}`
}

/** Hands `blob` to the browser's download; the object URL is released once the click has been dispatched. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // Some browsers read the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
