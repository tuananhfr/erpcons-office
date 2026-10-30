'use client'

import { useId, useState } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import { createPurge, type PurgeOutcome } from '@/lib/documents/purge.ts'
import type { Problem } from '@/lib/documents/types.ts'
import { Dialog } from './Dialog.tsx'
import { useIcon } from './IconsContext.tsx'
import type { DocIconName } from './icon-names.ts'
import type { MoveTarget } from './MoveDialog.tsx'

const WARNINGS = {
  document: 'Tài liệu sẽ bị xoá khỏi máy chủ ngay và không khôi phục lại được.',
  folder: 'Thư mục này cùng mọi thư mục con và tài liệu bên trong sẽ bị xoá khỏi máy chủ ngay và không khôi phục lại được.',
} as const

/**
 * Confirmation before a permanent delete. Unlike trash, it cannot be undone, so it asks first; focus starts on
 * "Huỷ" so Enter alone never deletes.
 */
export function PurgeDialog({ api, target, icon, onDone, onClose }: {
  api: DocumentsApi
  target: MoveTarget
  icon: DocIconName
  onDone: (outcome: Exclude<PurgeOutcome, { kind: 'failed' }>) => void
  onClose: () => void
}) {
  // One purge per dialog: its Idempotency-Key must outlive re-renders, and survive a retry of this same item.
  const [purge] = useState(() => createPurge(api))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const warningId = useId()
  const glyph = useIcon(icon)
  const warning = useIcon('warning')
  const purgeIcon = useIcon('trash')
  const isFolder = target.kind === 'folder'

  async function confirm() {
    if (busy) return
    setBusy(true)
    setProblem(null)
    const outcome = await purge(target)
    setBusy(false)
    if (outcome.kind === 'failed') setProblem(outcome.problem)
    else onDone(outcome)
  }

  return <Dialog title={isFolder ? 'Xoá vĩnh viễn thư mục?' : 'Xoá vĩnh viễn tài liệu?'} describedBy={warningId} onClose={onClose}>
    <div className="erp-docs-dialog__body">
      <p className="erp-docs-purge__item" data-icon={icon}>
        <span className="erp-docs-purge__item-icon">{glyph}</span>
        <span className="erp-docs-purge__item-name">{target.name}</span>
      </p>
      <p id={warningId} className="erp-docs-purge__warning">
        <span className="erp-docs-purge__warning-icon">{warning}</span>
        <span><strong>Không thể hoàn tác.</strong> {WARNINGS[target.kind]}</span>
      </p>
      <p className="erp-docs-field__error" role="alert">{problem?.message ?? null}</p>
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" data-autofocus onClick={onClose}>Huỷ</button>
        <button type="button" className="erp-btn erp-btn--danger" disabled={busy} aria-busy={busy} onClick={() => { void confirm() }}>
          {purgeIcon}{busy ? 'Đang xoá…' : 'Xoá vĩnh viễn'}
        </button>
      </div>
    </div>
  </Dialog>
}
