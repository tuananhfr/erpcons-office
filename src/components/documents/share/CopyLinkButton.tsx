'use client'

import { useId, useState } from 'react'
import { linkAction } from '@/lib/documents/link-copy.ts'
import type { DocumentItem, LinkState, Problem } from '@/lib/documents/types.ts'
import { useIcon } from '../IconsContext.tsx'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * "Sao chép đường liên kết" whenever the link is on and the person may share, and "Đặt lại đường liên kết" behind a
 * confirmation, since the old link then stops working for everyone who has it.
 */
export function CopyLinkButton({ doc, link, canReset, busy, onReset }: {
  doc: Pick<DocumentItem, 'format'>
  link: LinkState
  /** False for a non-owner while the link has an expiry: resetting turns it off first, which only the owner may. */
  canReset: boolean
  busy: boolean
  onReset: () => Promise<Problem | null>
}) {
  const [confirming, setConfirming] = useState(false)
  const [note, setNote] = useState<{ tone: 'done' | 'error'; text: string } | null>(null)
  // Shown for manual copying when the clipboard is refused (an insecure context, a denied permission).
  const [manual, setManual] = useState<string | null>(null)
  const linkIcon = useIcon('link')
  const resetIcon = useIcon('retry')
  const fieldId = useId()
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const action = linkAction(doc, link, origin)

  async function copy(url: string) {
    if (await copyText(url)) {
      setManual(null)
      setNote({ tone: 'done', text: 'Đã sao chép đường liên kết.' })
    } else {
      setManual(url)
      setNote({ tone: 'error', text: 'Trình duyệt không cho sao chép. Hãy chọn và sao chép đường liên kết bên dưới.' })
    }
  }
  async function reset() {
    const problem = await onReset()
    setConfirming(false)
    setManual(null)
    setNote(problem ? { tone: 'error', text: problem.message } : { tone: 'done', text: 'Đã đặt lại. Đường liên kết cũ không mở được nữa.' })
  }

  if (action.kind === 'off') return null
  if (action.kind === 'hidden') return <p className="erp-share-copy__hint">Hỏi chủ tài liệu để lấy đường liên kết.</p>
  return <div className="erp-share-copy">
    {!confirming && <div className="erp-share-copy__buttons">
      <button type="button" className="erp-btn erp-btn--secondary" onClick={() => { void copy(action.url) }}>{linkIcon}Sao chép đường liên kết</button>
      {canReset && <button type="button" className="erp-docs-link-btn erp-share-copy__reset" onClick={() => { setNote(null); setConfirming(true) }}>{resetIcon}Đặt lại đường liên kết</button>}
    </div>}
    {confirming && canReset && <div className="erp-share-copy__confirm" role="group" aria-label="Đặt lại đường liên kết">
      <p><strong>Đặt lại đường liên kết?</strong> Ai đang có đường liên kết cũ sẽ không mở được tài liệu nữa. Bạn cần gửi đường liên kết mới cho những người cần xem.</p>
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" onClick={() => setConfirming(false)}>Huỷ</button>
        <button type="button" className="erp-btn erp-btn--danger" disabled={busy} aria-busy={busy} onClick={() => { void reset() }}>
          {busy ? 'Đang đặt lại…' : 'Đặt lại'}
        </button>
      </div>
    </div>}
    {manual && <>
      <label className="erp-sr-only" htmlFor={fieldId}>Đường liên kết</label>
      <input id={fieldId} className="erp-docs-field__input erp-share-copy__manual" readOnly value={manual} onFocus={(event) => event.currentTarget.select()} />
    </>}
    <p className="erp-share-status" data-tone={note?.tone} role="status">{note?.text}</p>
  </div>
}
