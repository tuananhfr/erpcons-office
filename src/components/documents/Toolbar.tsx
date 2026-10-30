'use client'

import { useRef, type ChangeEvent } from 'react'
import type { KindInfo } from '@/lib/documents/formats.ts'
import { ONLINE_FORMATS } from '@/lib/documents/formats.ts'
import { withMimeTypes } from '@/lib/files/mime-types.ts'
import { useIcon } from './IconsContext.tsx'
import { NewDocumentMenu } from './NewDocumentMenu.tsx'

const ACCEPT = withMimeTypes(ONLINE_FORMATS.map((format) => `.${format}`).join(','))

export function Toolbar({ onNew, onUpload, onNewFolder }: {
  onNew: (info: KindInfo) => void
  onUpload: (files: File[]) => void
  onNewFolder: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useIcon('upload')
  const newFolder = useIcon('newFolder')
  function picked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length) onUpload(files)
  }
  return <div className="erp-docs-toolbar">
    <NewDocumentMenu onPick={onNew} />
    <input ref={input} className="erp-sr-only" tabIndex={-1} type="file" multiple accept={ACCEPT} aria-label="Chọn tệp để tải lên" onChange={picked} />
    <button type="button" className="erp-btn erp-btn--secondary" onClick={() => input.current?.click()}>{upload}Tải lên</button>
    <button type="button" className="erp-btn erp-btn--secondary" onClick={onNewFolder}>{newFolder}Thư mục mới</button>
  </div>
}
