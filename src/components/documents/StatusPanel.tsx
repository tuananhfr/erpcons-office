'use client'

import type { ReactNode } from 'react'
import type { Problem } from '@/lib/documents/types.ts'
import { account } from './use-account.ts'
import { useIcon } from './IconsContext.tsx'
import type { DocIconName } from './icon-names.ts'

/** Empty, error and signed-out states share one layout: icon, heading, one sentence, actions. */
export function StatusPanel({ icon, tone = 'info', title, children, actions }: {
  icon: DocIconName
  tone?: 'info' | 'error'
  title: string
  children?: ReactNode
  actions?: ReactNode
}) {
  const glyph = useIcon(icon)
  return <section className="erp-docs-status" data-tone={tone} aria-live={tone === 'error' ? 'assertive' : undefined}>
    <span className="erp-docs-status__icon">{glyph}</span>
    <h2 className="erp-docs-status__title">{title}</h2>
    {children && <div className="erp-docs-status__body">{children}</div>}
    {actions && <div className="erp-docs-status__actions">{actions}</div>}
  </section>
}

const TITLES: Partial<Record<Problem['kind'], string>> = {
  notFound: 'Không mở được thư mục',
  signIn: 'Cần đăng nhập lại',
  offline: 'Mất kết nối',
  busy: 'Máy chủ đang bận',
}

/** A listing that could not load. Retryable problems offer "Thử lại"; a 404 leads back to the top level. */
export function ProblemPanel({ problem, onRetry, onHome }: { problem: Problem; onRetry: () => void; onHome?: () => void }) {
  const retry = useIcon('retry')
  const icon: DocIconName = problem.kind === 'offline' ? 'offline' : problem.kind === 'signIn' ? 'locked' : 'warning'
  let actions: ReactNode
  if (problem.kind === 'signIn') {
    actions = <button type="button" className="erp-btn erp-btn--primary" onClick={() => { void account()?.signIn() }}>Đăng nhập</button>
  } else if (problem.kind === 'notFound' && onHome) {
    actions = <button type="button" className="erp-btn erp-btn--secondary" onClick={onHome}>Về Tài liệu của tôi</button>
  } else {
    actions = <button type="button" className="erp-btn erp-btn--secondary" onClick={onRetry}>{retry}Thử lại</button>
  }
  return <StatusPanel icon={icon} tone="error" title={TITLES[problem.kind] ?? 'Không tải được danh sách'} actions={actions}>
    <p>{problem.message}{problem.kind === 'notFound' ? '.' : ''}</p>
  </StatusPanel>
}

/** Placeholder rows shaped like the list, so nothing jumps when it arrives. */
export function ListSkeleton() {
  return <div className="erp-docs-skeleton" aria-busy="true" aria-label="Đang tải danh sách">
    {[0, 1, 2, 3].map((n) => <span key={n} />)}
  </div>
}
