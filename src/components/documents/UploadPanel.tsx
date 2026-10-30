'use client'

import { displayName } from '@/lib/files/intake-contract.ts'
import { useIcon } from './IconsContext.tsx'
import type { DocIconName } from './icon-names.ts'
import type { Upload, UploadStatus } from './use-uploads.ts'

const STATES: Readonly<Record<UploadStatus, { icon: DocIconName; text: string }>> = {
  waiting: { icon: 'progress', text: 'Đang chờ' },
  uploading: { icon: 'progress', text: 'Đang tải lên…' },
  done: { icon: 'done', text: 'Đã lưu online' },
  refused: { icon: 'failed', text: 'Không tải lên' },
  failed: { icon: 'warning', text: 'Tải lên thất bại' },
}

function UploadRow({ upload, onRetry }: { upload: Upload; onRetry: (id: string) => void }) {
  const state = STATES[upload.status]
  const icon = useIcon(state.icon)
  const retry = useIcon('retry')
  return <li className="erp-docs-upload__row" data-status={upload.status}>
    <span className="erp-docs-upload__state-icon">{icon}</span>
    <div className="erp-docs-upload__main">
      <span className="erp-docs-upload__name">{displayName(upload.name)}</span>
      <span className="erp-docs-upload__state">{state.text}</span>
      {upload.message && <span className="erp-docs-upload__message">{upload.message}</span>}
    </div>
    {upload.status === 'failed' && upload.retryable && <button type="button" className="erp-btn erp-btn--secondary erp-docs-upload__retry" onClick={() => onRetry(upload.id)}>{retry}Thử lại</button>}
  </li>
}

export function UploadPanel({ uploads, onRetry, onClear }: { uploads: Upload[]; onRetry: (id: string) => void; onClear: () => void }) {
  const close = useIcon('close')
  if (!uploads.length) return null
  const active = uploads.some((upload) => upload.status === 'waiting' || upload.status === 'uploading')
  const done = uploads.filter((upload) => upload.status === 'done').length
  return <section className="erp-docs-upload" aria-label="Tải lên">
    <div className="erp-docs-upload__head">
      <h2 aria-live="polite">{active ? `Đang tải lên ${done}/${uploads.length} tệp` : `Đã tải lên ${done}/${uploads.length} tệp`}</h2>
      {!active && <button type="button" className="erp-docs-icon-btn" aria-label="Đóng danh sách tải lên" onClick={onClear}>{close}</button>}
    </div>
    <ul className="erp-docs-upload__rows">
      {uploads.map((upload) => <UploadRow key={upload.id} upload={upload} onRetry={onRetry} />)}
    </ul>
  </section>
}
