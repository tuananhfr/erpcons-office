'use client'

import type { ReactNode } from 'react'
import { piAccount, usePiAccount } from '@/components/account/use-pi-account.ts'

/**
 * With PI sign-in on, the desktop downloads are offered to signed-in people only. A courtesy gate, not access
 * control: the installers stay public release assets.
 */
export function DesktopDownloadGate({ signInIcon, signupHref, children }: {
  signInIcon: ReactNode
  signupHref: string | null
  children: ReactNode
}) {
  const snapshot = usePiAccount()
  if (snapshot?.status === 'signed-in') return <>{children}</>
  const busy = snapshot?.status === 'signing-in'
  const unavailable = snapshot?.status === 'disabled'
  return <div className="erp-feature erp-downloads__gate">
    <h3>Đăng nhập để tải</h3>
    <p>Bản cài trên máy tính dành cho người dùng có tài khoản PI ID. Bản web vẫn dùng ngay, không cần tài khoản.</p>
    {unavailable
      ? <p>Không đăng nhập được ở chế độ này. Mở trang trong trình duyệt để tải bản cài.</p>
      : <div className="erp-downloads__gate-actions">
        <button type="button" className="erp-btn erp-btn--primary" disabled={!snapshot || busy} aria-busy={busy || undefined}
          onClick={() => { void piAccount()?.signIn() }}>
          {signInIcon}{busy ? 'Đang đăng nhập…' : 'Đăng nhập để tải'}
        </button>
        {signupHref && <a className="erp-btn erp-btn--secondary" href={signupHref}>Đăng ký miễn phí</a>}
      </div>}
    {snapshot?.error && <p className="erp-downloads__gate-error" role="alert">{snapshot.error.message}</p>}
  </div>
}
