'use client'

import { useEffect, useRef } from 'react'

/** Asked inside the row. Unlike a restore nothing brings the version back, so "Huỷ" takes the focus. */
export function DeleteVersionConfirm({ version, busy, onConfirm, onCancel }: {
  version: number
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancel.current?.focus() }, [])
  return <div className="erp-versions-confirm" data-tone="danger" role="group" aria-label={`Xoá phiên bản ${version}`}>
    <p><strong>Xoá vĩnh viễn phiên bản này?</strong> Không thể hoàn tác.</p>
    <div className="erp-docs-dialog__actions">
      <button ref={cancel} type="button" className="erp-btn erp-btn--secondary" onClick={onCancel} disabled={busy}>Huỷ</button>
      <button type="button" className="erp-btn erp-btn--danger" onClick={onConfirm} disabled={busy} aria-busy={busy}>
        {busy ? 'Đang xoá…' : 'Xoá'}
      </button>
    </div>
  </div>
}
