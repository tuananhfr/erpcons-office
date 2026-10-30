'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export type SignupIcons = Record<'sent' | 'closed' | 'verifying' | 'verified' | 'invalid' | 'error' | 'show' | 'hide' | 'alert' | 'retry', ReactNode>

/**
 * One state of the sign-up pages after the form: icon, heading, text, actions. With `announce` the heading takes
 * focus when it appears, so a screen reader reads the new state instead of the vanished button.
 */
export function SignupPanel({ icon, tone = 'info', title, children, actions, announce = true, busy = false }: {
  icon: ReactNode
  tone?: 'info' | 'success' | 'error'
  title: string
  children?: ReactNode
  actions?: ReactNode
  announce?: boolean
  busy?: boolean
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { if (announce) heading.current?.focus() }, [announce, title])
  return <section className="erp-signup-status" data-tone={tone} aria-busy={busy || undefined}>
    <span className="erp-signup-status__icon">{icon}</span>
    <h2 ref={heading} tabIndex={-1} className="erp-signup-status__title">{title}</h2>
    {children && <div className="erp-signup-status__body">{children}</div>}
    {actions && <div className="erp-signup-status__actions">{actions}</div>}
  </section>
}
