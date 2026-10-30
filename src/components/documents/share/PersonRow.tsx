'use client'

import { useId, useState } from 'react'
import { formatDate } from '@/lib/documents/display.ts'
import { GRANT_ROLE_OPTIONS, ROLE_LABELS } from '@/lib/documents/roles.ts'
import type { GrantRole, Permission, Problem } from '@/lib/documents/types.ts'
import { useIcon } from '../IconsContext.tsx'
import { RowMenu } from '../RowMenu.tsx'

/** First letter of the name or the address, for the round badge. */
export function initialOf(text: string): string {
  return (Array.from(text.trim())[0] ?? '?').toLocaleUpperCase('vi-VN')
}

/** End of the chosen day in local time, as the API's date-time. */
function endOfDay(date: string): string {
  return new Date(`${date}T23:59:59`).toISOString()
}

/** One person with access. With `canShare`, their role and removal can be changed here; the expiry by the owner only. */
export function PersonRow({ permission, isMe, canShare, canSetExpiry, busy, onRole, onExpiry, onRemove }: {
  permission: Permission
  isMe: boolean
  canShare: boolean
  canSetExpiry: boolean
  busy: boolean
  onRole: (role: GrantRole) => Promise<Problem | null>
  onExpiry: (expiresAt: string | null) => Promise<Problem | null>
  onRemove: () => Promise<Problem | null>
}) {
  const [editingExpiry, setEditingExpiry] = useState(false)
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const selectId = useId()
  const dateId = useId()
  const icons = { remove: useIcon('trash'), expiry: useIcon('history') }
  const name = permission.displayName || permission.email || 'Người được mời'
  const label = name + (isMe ? ' (bạn)' : '')
  const report = (problem: Problem | null) => setError(problem ? problem.message : null)
  const [tomorrow] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10))

  return <li className="erp-share-person" data-pending={permission.pending || undefined}>
    <span className="erp-share-person__avatar" aria-hidden="true">{initialOf(name)}</span>
    <div className="erp-share-person__main">
      <p className="erp-share-person__name">{label}</p>
      <p className="erp-share-person__meta">
        {permission.displayName && permission.email && <span>{permission.email}</span>}
        {permission.pending && <span className="erp-share-person__pending">Chưa đăng nhập để nhận lời mời</span>}
        {permission.expiresAt && <span className="erp-share-person__expiry">Hết quyền sau {formatDate(permission.expiresAt)}</span>}
      </p>
      {editingExpiry && <form className="erp-share-expiry" onSubmit={async (event) => {
        event.preventDefault()
        if (!date) return setError('Chọn ngày hết quyền.')
        const problem = await onExpiry(endOfDay(date))
        report(problem)
        if (!problem) setEditingExpiry(false)
      }}>
        <label className="erp-docs-field__label" htmlFor={dateId}>Hết quyền truy cập sau ngày</label>
        <div className="erp-share-expiry__row">
          <input id={dateId} className="erp-docs-field__input" type="date" min={tomorrow} value={date} onChange={(event) => setDate(event.target.value)} />
          <button type="submit" className="erp-btn erp-btn--primary" disabled={busy}>Lưu</button>
          <button type="button" className="erp-btn erp-btn--secondary" onClick={() => { setEditingExpiry(false); setError(null) }}>Huỷ</button>
        </div>
      </form>}
      {error && <p className="erp-docs-field__error" role="alert">{error}</p>}
    </div>
    {canShare
      ? <div className="erp-share-person__controls">
        <label className="erp-sr-only" htmlFor={selectId}>Vai trò của {name}</label>
        <select id={selectId} className="erp-share-select" value={permission.role} disabled={busy}
          onChange={(event) => { void onRole(event.target.value as GrantRole).then(report) }}>
          {GRANT_ROLE_OPTIONS.map((option) => <option key={option.role} value={option.role}>{option.label}</option>)}
        </select>
        <RowMenu label={`Thao tác với quyền của ${name}`} items={[
          ...(canSetExpiry ? [{ label: permission.expiresAt ? 'Đổi thời hạn truy cập' : 'Thêm thời hạn truy cập', icon: icons.expiry, onSelect: () => { setDate(permission.expiresAt?.slice(0, 10) ?? ''); setEditingExpiry(true) } }] : []),
          ...(canSetExpiry && permission.expiresAt ? [{ label: 'Bỏ thời hạn truy cập', icon: icons.expiry, onSelect: () => { void onExpiry(null).then(report) } }] : []),
          { label: 'Xoá quyền truy cập', icon: icons.remove, danger: true, onSelect: () => { void onRemove().then(report) } },
        ]} />
      </div>
      : <span className="erp-share-person__role">{ROLE_LABELS[permission.role]}</span>}
  </li>
}
