'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePiAccount } from '@/components/account/use-pi-account.ts'
import { verifySignup } from '@/lib/signup/api.ts'
import { takeVerificationToken } from '@/lib/signup/token.ts'
import { SignInButton } from './SignInButton.tsx'
import { SignupPanel, type SignupIcons } from './SignupPanel.tsx'

type State =
  | { kind: 'verifying'; announce: boolean }
  | { kind: 'verified' }
  | { kind: 'missing' }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; message: string }

const DEAD_LINK = 'Liên kết xác minh không đúng, đã được dùng hoặc đã hết hạn.'

function Verified({ icons }: { icons: SignupIcons }) {
  const snapshot = usePiAccount()
  const signedIn = snapshot?.status === 'signed-in'
  return <SignupPanel icon={icons.verified} tone="success" title="Email đã được xác minh"
    actions={signedIn
      ? <a className="erp-btn erp-btn--primary" href="/tai-lieu/">Mở Tài liệu của tôi</a>
      : <SignInButton label="Đăng nhập bằng PI ID" />}>
    <p>Tài khoản PI ID của bạn sẽ sẵn sàng sau vài giây. Đăng nhập bằng email và mật khẩu vừa đăng ký.</p>
    <p>Nếu email này đã có tài khoản PI ID từ trước, mật khẩu cũ được giữ nguyên; chúng tôi sẽ gửi thêm một email để nhắc.</p>
    {signedIn && <p>Bạn đang đăng nhập{snapshot.user?.email ? <> với <strong className="erp-signup__email">{snapshot.user.email}</strong></> : null}.</p>}
  </SignupPanel>
}

export function VerifySignup({ icons }: { icons: SignupIcons }) {
  const [state, setState] = useState<State>({ kind: 'verifying', announce: false })
  // Memory only: the token never goes to storage, logs or the address bar, and is dropped once the server answered.
  const token = useRef<string | null>(null)
  const started = useRef(false)
  const sending = useRef(false)

  const verify = useCallback(async (announce: boolean) => {
    const current = token.current
    // A second request with the same token would come back INVALID_TOKEN and could replace the first answer.
    if (!current || sending.current) return
    sending.current = true
    setState({ kind: 'verifying', announce })
    const result = await verifySignup(current)
    sending.current = false
    if (result.kind === 'failed') { setState({ kind: 'failed', message: result.message }); return }
    token.current = null
    setState(result.kind === 'verified' ? { kind: 'verified' } : { kind: 'invalid', message: result.message })
  }, [])

  useEffect(() => {
    const take = (first: boolean) => {
      const taken = takeVerificationToken(window.location, window.history)
      if (taken.kind === 'token') {
        token.current = taken.token
        void verify(!first)
      } else if (first || taken.kind === 'malformed') {
        setState(taken.kind === 'missing' ? { kind: 'missing' } : { kind: 'invalid', message: DEAD_LINK })
      }
    }
    // Effects run twice in development (StrictMode); the link must be used once.
    if (!started.current) {
      started.current = true
      take(true)
    }
    // A link pasted into this same tab changes only the fragment, which reloads nothing.
    const onHashChange = () => take(false)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [verify])

  switch (state.kind) {
    case 'verifying':
      return <SignupPanel icon={icons.verifying} title="Đang xác minh email…" announce={state.announce} busy>
        <p>Vui lòng giữ trang này mở trong giây lát.</p>
        <noscript><p>Trang này cần bật JavaScript để xác minh email.</p></noscript>
      </SignupPanel>
    case 'verified':
      return <Verified icons={icons} />
    case 'missing':
      return <SignupPanel icon={icons.invalid} title="Thiếu liên kết xác minh"
        actions={<a className="erp-btn erp-btn--secondary" href="/dang-ky/">Đến trang đăng ký</a>}>
        <p>Mở trang này bằng liên kết trong email xác minh chúng tôi đã gửi. Nếu chưa đăng ký, hãy bắt đầu từ trang đăng ký.</p>
      </SignupPanel>
    case 'invalid':
      return <SignupPanel icon={icons.invalid} tone="error" title="Liên kết không còn dùng được"
        actions={<>
          <a className="erp-btn erp-btn--primary" href="/dang-ky/">Đăng ký lại</a>
          <SignInButton label="Đăng nhập" variant="secondary" />
        </>}>
        <p>{state.message}</p>
        <p>Mỗi liên kết dùng được một lần trong 48 giờ, và chỉ liên kết trong email mới nhất còn hiệu lực. Nếu đã xác minh rồi, bạn có thể đăng nhập ngay.</p>
      </SignupPanel>
    case 'failed':
      return <SignupPanel icon={icons.error} tone="error" title="Chưa xác minh được"
        actions={<button type="button" className="erp-btn erp-btn--secondary" onClick={() => { void verify(true) }}>{icons.retry}Thử lại</button>}>
        <p>{state.message}</p>
        <p>Liên kết của bạn vẫn còn nguyên; hãy thử lại khi có mạng.</p>
      </SignupPanel>
  }
}
