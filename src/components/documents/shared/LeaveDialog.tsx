'use client'

import { useState } from 'react'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'
import type { Problem, SharedDocument } from '@/lib/documents/types.ts'
import { Dialog } from '../Dialog.tsx'

/** Asked first: only the owner (or an editor allowed to share) can give the access back. */
export function LeaveDialog({ api, doc, userId, onClose, onDone }: {
  api: SharingApi
  doc: Pick<SharedDocument, 'id' | 'title' | 'ownerName'>
  userId: string
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)

  async function leave() {
    setBusy(true)
    const result = await api.leave(doc.id, userId)
    setBusy(false)
    if (result.ok) onDone()
    else setProblem(result.problem)
  }

  return <Dialog title="Gỡ khỏi danh sách của tôi" onClose={onClose}>
    <div className="erp-docs-dialog__body">
      <p className="erp-docs-dialog__text">Bạn sẽ không mở được “{doc.title}” nữa{doc.ownerName ? ` cho đến khi ${doc.ownerName} chia sẻ lại` : ' cho đến khi chủ tài liệu chia sẻ lại'}.</p>
      <p className="erp-docs-field__error" role="alert">{problem ? (problem.kind === 'notFound' ? `${problem.message}.` : problem.message) : null}</p>
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" onClick={onClose} data-autofocus>Huỷ</button>
        <button type="button" className="erp-btn erp-btn--danger" onClick={() => { void leave() }} disabled={busy} aria-busy={busy}>
          {busy ? 'Đang gỡ…' : 'Gỡ'}
        </button>
      </div>
    </div>
  </Dialog>
}
