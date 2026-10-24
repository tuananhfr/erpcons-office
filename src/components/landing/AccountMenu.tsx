'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { AccountSnapshot, ErpAccount } from '@/lib/account/types.ts'

type AccountWindow = Window & { erpAccount?: ErpAccount }

// The static HTML shows the signed-out button; the inline account.js snapshot replaces it on hydration.
const SERVER_SNAPSHOT: AccountSnapshot = {
  version: 1, status: 'signed-out', user: null, orgs: [], activeOrg: null, product: null,
  entitlements: [], entitlementsFresh: false, error: null,
}

const account = () => (window as AccountWindow).erpAccount
const subscribe = (onChange: () => void) => account()?.onChange(onChange) ?? (() => {})
const read = () => account()?.snapshot() ?? null

// Vietnamese names put the given name last, which is what people are called by.
function initials(name: string, email: string | null): string {
  const source = (name || email || '').trim()
  if (!source) return '?'
  const words = source.split(/\s+/)
  return (name ? words[words.length - 1] : source).normalize('NFC').charAt(0).toLocaleUpperCase('vi')
}

function OrgChoices({ snapshot, onPick }: { snapshot: AccountSnapshot; onPick: () => void }) {
  if (!snapshot.orgs.length) return null
  const activeId = snapshot.activeOrg?.id ?? null
  const choices = [{ id: null, name: 'Cá nhân' }, ...snapshot.orgs.map((org) => ({ id: org.id, name: org.name }))]
  return <div className="erp-account__orgs" role="group" aria-label="Tổ chức">
    <p className="erp-account__orgs-title">Tổ chức</p>
    {choices.map((choice) => <button key={choice.id ?? 'personal'} type="button" className="erp-account__action"
      aria-pressed={choice.id === activeId}
      onClick={() => { if (choice.id === activeId) return; onPick(); void account()?.selectOrg(choice.id) }}>
      {choice.name}
    </button>)}
  </div>
}

function Details({ snapshot, onDone }: { snapshot: AccountSnapshot; onDone: () => void }) {
  const user = snapshot.user
  return <>
    <p className="erp-account__name">{user?.name || user?.email || 'Tài khoản PI ID'}</p>
    {user?.name && user.email && <p className="erp-account__email">{user.email}</p>}
    <OrgChoices snapshot={snapshot} onPick={onDone} />
    <button type="button" className="erp-account__action erp-account__sign-out" onClick={() => { onDone(); void account()?.signOut() }}>Đăng xuất</button>
  </>
}

/** PI ID sign-in for the landing header; rendered only when PI_ACCOUNT_ENABLED. */
export function AccountMenu({ variant, icon }: { variant: 'header' | 'menu'; icon: ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const root = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('.erp-account__panel button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggle.current?.focus()
    }
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!snapshot || snapshot.status === 'disabled') return null
  const signedIn = snapshot.status === 'signed-in'
  const note = snapshot.error && <p className="erp-account__note" role="status">{snapshot.error.message}</p>

  if (!signedIn) {
    const busy = snapshot.status === 'signing-in'
    return <div className={`erp-account erp-account--${variant}`}>
      <button type="button" className="erp-account__sign-in" disabled={busy} aria-busy={busy}
        onClick={() => { void account()?.signIn() }}>
        {icon}Đăng nhập
      </button>
      {note}
    </div>
  }

  const user = snapshot.user
  if (variant === 'menu') {
    return <div className="erp-account erp-account--menu">
      <Details snapshot={snapshot} onDone={() => {}} />
      {note}
    </div>
  }
  const label = user?.name || user?.email || 'PI ID'
  return <div className="erp-account erp-account--header" ref={root}>
    <button ref={toggle} type="button" className="erp-account__avatar" aria-expanded={open} aria-controls={panelId}
      aria-label={`Tài khoản: ${label}${snapshot.activeOrg ? ` · ${snapshot.activeOrg.name}` : ''}`}
      onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">{initials(user?.name ?? '', user?.email ?? null)}</span>
    </button>
    {open && <div id={panelId} className="erp-account__panel">
      <Details snapshot={snapshot} onDone={() => { setOpen(false); toggle.current?.focus() }} />
    </div>}
    {note}
  </div>
}
