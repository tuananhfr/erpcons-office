'use client'

import { useId, useState } from 'react'
import { formatDate } from '@/lib/documents/display.ts'
import type { Problem } from '@/lib/documents/types.ts'
import { useIcon } from '../IconsContext.tsx'

/**
 * "Quyền truy cập chung": only the people added, or anyone holding the link (as a viewer; plan §0, #2). A link with
 * an expiry is the owner's to turn off: the server refuses it to everyone else.
 */
export function GeneralAccess({ enabled, expiresAt, canShare, isOwner, busy, onEnable, onDisable }: {
  enabled: boolean
  expiresAt: string | null
  canShare: boolean
  isOwner: boolean
  busy: boolean
  onEnable: () => Promise<Problem | null>
  onDisable: () => Promise<Problem | null>
}) {
  const [error, setError] = useState<string | null>(null)
  const selectId = useId()
  const icon = useIcon(enabled ? 'globe' : 'lock')
  const helper = enabled
    ? 'Bất kỳ ai có đường liên kết đều xem được, không cần đăng nhập.'
    : 'Chỉ những người đã được thêm mới mở được tài liệu.'
  const locked = enabled && expiresAt !== null && !isOwner

  async function change(value: string) {
    setError(null)
    const problem = value === 'link' ? await onEnable() : await onDisable()
    if (problem) setError(problem.message)
  }

  return <section className="erp-share-section" aria-labelledby={`${selectId}-title`}>
    <h3 id={`${selectId}-title`} className="erp-share-section__title">Quyền truy cập chung</h3>
    <div className="erp-share-general" data-enabled={enabled || undefined}>
      <span className="erp-share-general__icon" aria-hidden="true">{icon}</span>
      <div className="erp-share-general__main">
        {canShare
          ? <>
            <label className="erp-sr-only" htmlFor={selectId}>Ai được mở tài liệu</label>
            <select id={selectId} className="erp-share-select erp-share-select--plain" value={enabled ? 'link' : 'restricted'} disabled={busy || locked}
              onChange={(event) => { void change(event.target.value) }}>
              <option value="restricted">Hạn chế</option>
              <option value="link">Bất kỳ ai có đường liên kết</option>
            </select>
          </>
          : <p className="erp-share-general__value">{enabled ? 'Bất kỳ ai có đường liên kết' : 'Hạn chế'}</p>}
        <p className="erp-share-general__helper">{helper}</p>
        {enabled && expiresAt && <p className="erp-share-general__helper">
          Đường liên kết hết hạn sau {formatDate(expiresAt)}.{locked && ' Chỉ chủ tài liệu tắt hoặc đặt lại được.'}
        </p>}
        {/* Removing someone does not change the link: what they copied keeps working until it is reset. */}
        {enabled && canShare && <p className="erp-share-general__note">Người đã có đường liên kết vẫn mở được cho tới khi bạn đặt lại đường liên kết.</p>}
      </div>
      {enabled && <span className={canShare ? 'erp-share-general__role erp-share-general__role--select' : 'erp-share-general__role'}>Người xem</span>}
    </div>
    {error && <p className="erp-docs-field__error" role="alert">{error}</p>}
  </section>
}
