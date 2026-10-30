'use client'

import { useId, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
import { MAX_RECIPIENTS, splitEmails } from '@/lib/documents/emails.ts'
import { GRANT_ROLE_OPTIONS } from '@/lib/documents/roles.ts'
import type { GrantRole } from '@/lib/documents/types.ts'
import { useIcon } from '../IconsContext.tsx'
import type { ChangeOutcome } from './use-sharing.ts'

const MESSAGE_MAX = 1000

/**
 * "Thêm người": addresses become chips as they are typed or pasted; a role for all of them; "Thông báo cho mọi
 * người" with an optional message, as in Google Docs. Nothing is sent until "Gửi".
 */
export function InviteForm({ busy, skip, onInvite }: {
  busy: boolean
  /** Addresses that already have access (the owner, people listed): adding them again would do nothing. */
  skip: readonly string[]
  onInvite: (emails: string[], role: GrantRole, notify: boolean, message: string | null) => Promise<ChangeOutcome>
}) {
  const [chips, setChips] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const [role, setRole] = useState<GrantRole>('viewer')
  const [notify, setNotify] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const close = useIcon('close')
  const inputId = useId()
  const roleId = useId()
  const errorId = useId()
  const messageId = useId()

  /** Moves whatever valid addresses `text` holds into chips; returns the chips that result. */
  function commit(text: string): string[] {
    const { valid, invalid } = splitEmails(text)
    const next = [...chips]
    for (const email of valid) if (!next.includes(email)) next.push(email)
    setChips(next)
    setDraft(invalid.join(' '))
    setError(invalid.length ? `Địa chỉ email không hợp lệ: ${invalid.join(', ')}` : null)
    setDone(null)
    return next
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === 'Enter' || event.key === ',' || event.key === ';' || event.key === ' ') && draft.trim()) {
      event.preventDefault()
      commit(draft)
    } else if (event.key === 'Backspace' && !draft && chips.length) {
      setChips(chips.slice(0, -1))
    }
  }
  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData('text')
    if (!/[\s,;]/.test(text)) return
    event.preventDefault()
    commit(`${draft} ${text}`)
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const emails = draft.trim() ? commit(draft) : chips
    if (draft.trim() && splitEmails(draft).invalid.length) return
    const fresh = emails.filter((email) => !skip.includes(email))
    if (!fresh.length) return setError(emails.length ? 'Những người này đã có quyền truy cập.' : 'Nhập ít nhất một địa chỉ email.')
    if (fresh.length > MAX_RECIPIENTS) return setError(`Mỗi lần chia sẻ tối đa ${MAX_RECIPIENTS} người.`)
    const outcome = await onInvite(fresh, role, notify, notify && message.trim() ? message.trim() : null)
    if (outcome.problem) {
      const { problem } = outcome
      setError(problem.kind === 'invalid' ? 'Máy chủ không nhận một trong các địa chỉ email này. Hãy kiểm tra lại.' : problem.message)
      return
    }
    setChips([])
    setDraft('')
    setMessage('')
    setError(null)
    // Access is given anyway. The server skips mails for several reasons (caps, no verified sender address), so one
    // neutral sentence covers them all.
    if (notify && outcome.mailSkipped > 0) {
      setDone('Đã chia sẻ. Một số email thông báo không được gửi.')
    } else {
      setDone(notify ? `Đã chia sẻ và gửi thông báo cho ${fresh.length} người.` : `Đã chia sẻ với ${fresh.length} người.`)
    }
  }

  const composing = chips.length > 0 || draft.trim().length > 0
  return <form className="erp-share-invite" onSubmit={submit} noValidate>
    <label className="erp-docs-field__label" htmlFor={inputId}>Thêm người bằng email</label>
    <div className="erp-share-invite__row">
      <div className="erp-share-chips" data-invalid={error ? true : undefined}>
        {chips.map((email) => <span key={email} className="erp-share-chip">
          <span className="erp-share-chip__text">{email}</span>
          <button type="button" className="erp-share-chip__remove" aria-label={`Bỏ ${email}`} onClick={() => setChips(chips.filter((c) => c !== email))}>{close}</button>
        </span>)}
        <input id={inputId} className="erp-share-chips__input" type="email" inputMode="email" autoComplete="off" spellCheck={false} value={draft}
          placeholder={chips.length ? '' : 'ten@congty.vn'} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
          onChange={(event) => { setDraft(event.target.value); setError(null); setDone(null) }} onKeyDown={onKey} onPaste={onPaste}
          onBlur={() => { if (draft.trim()) commit(draft) }} />
      </div>
      <label className="erp-sr-only" htmlFor={roleId}>Vai trò của người được thêm</label>
      <select id={roleId} className="erp-share-select" value={role} onChange={(event) => setRole(event.target.value as GrantRole)}>
        {GRANT_ROLE_OPTIONS.map((option) => <option key={option.role} value={option.role}>{option.label}</option>)}
      </select>
    </div>
    <p id={errorId} className="erp-docs-field__error" role="alert">{error}</p>
    {composing && <div className="erp-share-invite__notify">
      <label className="erp-share-check">
        <input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />
        <span>Thông báo cho mọi người</span>
      </label>
      {notify && <>
        <label className="erp-docs-field__label" htmlFor={messageId}>Lời nhắn <span className="erp-share-optional">(không bắt buộc)</span></label>
        <textarea id={messageId} className="erp-docs-field__input erp-share-invite__message" rows={3} maxLength={MESSAGE_MAX}
          value={message} onChange={(event) => setMessage(event.target.value)} />
      </>}
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" onClick={() => { setChips([]); setDraft(''); setError(null) }}>Huỷ</button>
        <button type="submit" className="erp-btn erp-btn--primary" disabled={busy} aria-busy={busy}>{busy ? 'Đang gửi…' : notify ? 'Gửi' : 'Chia sẻ'}</button>
      </div>
    </div>}
    <p className="erp-share-status" role="status">{done}</p>
  </form>
}
