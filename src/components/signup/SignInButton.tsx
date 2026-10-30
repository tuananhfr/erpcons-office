'use client'

import { piAccount, usePiAccount } from '@/components/account/use-pi-account.ts'

/** Opens the PI ID popup; hidden where sign-in cannot work (embedded, storage blocked, PI sign-in off). */
export function SignInButton({ label, variant = 'primary' }: { label: string; variant?: 'primary' | 'secondary' }) {
  const snapshot = usePiAccount()
  if (snapshot?.status === 'disabled') return null
  const busy = snapshot?.status === 'signing-in'
  return <>
    <button type="button" className={`erp-btn erp-btn--${variant}`} disabled={!snapshot || busy} aria-busy={busy || undefined}
      onClick={() => { void piAccount()?.signIn() }}>
      {busy ? 'Đang đăng nhập…' : label}
    </button>
    {snapshot?.error && <p className="erp-signup__notice erp-signup__notice--block" role="alert">{snapshot.error.message}</p>}
  </>
}
