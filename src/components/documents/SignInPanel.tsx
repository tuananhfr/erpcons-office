'use client'

import type { AccountSnapshot } from '@/lib/account/types.ts'
import { StatusPanel } from './StatusPanel.tsx'
import { account } from './use-account.ts'

/** Signed out: invite to sign in and make no API call. The Free promise is repeated, since it still holds. */
export function SignInPanel({ snapshot }: { snapshot: AccountSnapshot }) {
  const busy = snapshot.status === 'signing-in'
  return <StatusPanel icon="cloud" title="Đăng nhập để xem tài liệu online"
    actions={<>
      <button type="button" className="erp-btn erp-btn--primary" disabled={busy} aria-busy={busy} onClick={() => { void account()?.signIn() }}>
        {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- static hosting, full navigation */}
      <a className="erp-btn erp-btn--secondary" href="/">Dùng bản Free</a>
    </>}>
    <p>Tài liệu lưu online nằm trên máy chủ ERPCons, để bạn mở lại ở thiết bị khác bằng tài khoản PI ID.</p>
    <p>Bản Free vẫn không cần tài khoản: tệp mở từ máy được xử lý ngay trên thiết bị và không gửi lên máy chủ.</p>
    {snapshot.error && <p className="erp-docs-status__error" role="alert">{snapshot.error.message}</p>}
  </StatusPanel>
}

export function UnavailablePanel() {
  return <StatusPanel icon="locked" title="Tài liệu online không dùng được ở đây">
    <p>Trang này cần đăng nhập PI ID, vốn không có trong chế độ nhúng hoặc khi trình duyệt chặn lưu trữ của trang.</p>
  </StatusPanel>
}
