'use client'

import type { MouseEvent, ReactNode } from 'react'
import type { Problem } from '@/lib/documents/types.ts'
import { useIcon } from './IconsContext.tsx'
import type { DocIconName } from './icon-names.ts'

export interface Row {
  key: string
  icon: DocIconName
  /** Display name; always rendered as text. */
  name: string
  /** Absent for items that cannot be opened (the trash). */
  href?: string
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void
  /** Kind label for screen readers and the narrow layout, e.g. "Thư mục", "Bảng tính". */
  type: string
  updated: string
  size: string
  note?: string
  /** "Được chia sẻ với tôi": whose document it is. */
  owner?: string
  /** Shared with me and not opened yet. */
  isNew?: boolean
  /** One of mine that other people (or the link) can open. */
  shared?: boolean
  /** The row's menu or its single action. */
  action: ReactNode
}

function ItemRow({ row }: { row: Row }) {
  const icon = useIcon(row.icon)
  const people = useIcon('shared')
  return <li className="erp-docs-row" data-icon={row.icon} data-new={row.isNew || undefined}>
    <span className="erp-docs-row__icon">{icon}</span>
    <div className="erp-docs-row__main">
      <div className="erp-docs-row__line">
        {row.href
          ? <a className="erp-docs-row__name" href={row.href} onClick={row.onOpen} onAuxClick={row.onOpen}>{row.name}</a>
          : <span className="erp-docs-row__name">{row.name}</span>}
        {row.isNew && <span className="erp-docs-row__new">Mới</span>}
        {row.shared && <span className="erp-docs-row__shared" title="Đã chia sẻ">{people}<span className="erp-sr-only">Đã chia sẻ</span></span>}
      </div>
      <p className="erp-docs-row__meta">
        <span>{row.type}</span>
        {row.owner && <span className="erp-docs-row__owner">{row.owner}</span>}
        {row.size && <span className="erp-docs-row__meta-size">{row.size}</span>}
        {row.updated && <span className="erp-docs-row__meta-updated">{row.updated}</span>}
        {row.note && <span className="erp-docs-row__note">{row.note}</span>}
      </p>
    </div>
    <span className="erp-docs-row__updated">{row.updated}</span>
    <span className="erp-docs-row__size">{row.size}</span>
    <div className="erp-docs-row__action">{row.action}</div>
  </li>
}

/** Folders and documents (or the trash) as one list; the column header only shows where there is room for columns. */
export function ItemList({ label, rows, updatedLabel, hasMore, more, onMore }: {
  label: string
  rows: Row[]
  updatedLabel: string
  hasMore: boolean
  more: 'idle' | 'loading' | Problem
  onMore: () => void
}) {
  const retry = useIcon('retry')
  return <div className="erp-docs-list">
    <div className="erp-docs-list__head" aria-hidden="true">
      <span>Tên</span><span>{updatedLabel}</span><span>Kích thước</span><span />
    </div>
    <ul className="erp-docs-list__rows" aria-label={label}>
      {rows.map((row) => <ItemRow key={row.key} row={row} />)}
    </ul>
    {hasMore && <div className="erp-docs-list__more">
      {typeof more === 'object' && <p className="erp-docs-list__more-error" role="alert">{more.message}</p>}
      <button type="button" className="erp-btn erp-btn--secondary" onClick={onMore} disabled={more === 'loading'} aria-busy={more === 'loading'}>
        {typeof more === 'object' && retry}{more === 'loading' ? 'Đang tải…' : typeof more === 'object' ? 'Thử lại' : 'Tải thêm'}
      </button>
    </div>}
  </div>
}
