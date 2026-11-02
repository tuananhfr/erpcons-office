'use client'

import { piAccount, usePiAccount } from '@/components/account/use-pi-account.ts'

export function CloudOfficeAction() {
  const snapshot = usePiAccount()
  const busy = snapshot?.status === 'signing-in'
  return <div className="erp-cloud__actions">
    {snapshot?.status === 'signed-in'
      ? <a className="erp-btn erp-btn--primary" href="/tai-lieu/">Tài liệu của tôi</a>
      : <button type="button" className="erp-btn erp-btn--primary" disabled={!snapshot || busy || snapshot.status === 'disabled'} aria-busy={busy || undefined} onClick={() => { void piAccount()?.signIn() }}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập PI ID'}</button>}
    <a href="/tai-lieu/">Mở Cloud Office <span aria-hidden="true">→</span></a>
    {snapshot?.error && <p className="erp-file-error" role="alert">{snapshot.error.message}</p>}
  </div>
}
