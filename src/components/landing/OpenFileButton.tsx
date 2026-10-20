'use client'

import { useRef, useState, type ReactNode, type ChangeEvent } from 'react'
import { prepareFile, MAX_FILE_SIZE } from '@/lib/files/pending-file.ts'
import { withMimeTypes } from '@/lib/files/mime-types.ts'

const ACCEPT = withMimeTypes('.docx,.xlsx,.pptx,.pdf')

export function OpenFileButton({ icon }: { icon: ReactNode }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function open(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const url = await prepareFile(file)
      window.location.assign(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không mở được tệp. Vui lòng thử lại.')
      setBusy(false)
    }
  }
  return <div className="erp-open-file">
    <input ref={input} className="erp-sr-only" tabIndex={-1} type="file" accept={ACCEPT} aria-label="Chọn tệp văn phòng từ máy" onChange={open} />
    <button type="button" className="erp-btn erp-btn--primary" onClick={() => input.current?.click()} disabled={busy}>{icon}{busy ? 'Đang chuẩn bị tệp…' : 'Mở tệp từ máy'}</button>
    <span className="erp-sr-only">Hỗ trợ DOCX, XLSX, PPTX và PDF, tối đa {MAX_FILE_SIZE / 1024 / 1024} MB.</span>
    {error ? <p className="erp-file-error" role="alert">{error}</p> : null}
  </div>
}
