'use client'

import { useEffect, useRef } from 'react'

/** Asked inside the row: a restore adds a new version, so nothing is lost, but everyone working on it sees the change. */
export function RestoreConfirm({ version, current, busy, onConfirm, onCancel }: {
  version: number
  current: number
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const confirm = useRef<HTMLButtonElement>(null)
  // Opened from the row's button, which this replaces for keyboard and screen reader users.
  useEffect(() => { confirm.current?.focus() }, [])
  return <div className="erp-versions-confirm" role="group" aria-label={`Khôi phục phiên bản ${version}`}>
    <p><strong>Khôi phục phiên bản này?</strong> Nội dung của phiên bản {version} sẽ thành phiên bản {current + 1}, phiên bản hiện tại.
      Các phiên bản khác vẫn giữ trong lịch sử.</p>
    <div className="erp-docs-dialog__actions">
      <button type="button" className="erp-btn erp-btn--secondary" onClick={onCancel} disabled={busy}>Huỷ</button>
      <button ref={confirm} type="button" className="erp-btn erp-btn--primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>
        {busy ? 'Đang khôi phục…' : 'Khôi phục'}
      </button>
    </div>
  </div>
}
