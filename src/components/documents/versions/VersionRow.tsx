'use client'

import { formatBytes, formatMoment } from '@/lib/documents/display.ts'
import type { Version } from '@/lib/documents/types.ts'
import { useIcon } from '../IconsContext.tsx'
import { RowMenu } from '../RowMenu.tsx'
import { DeleteVersionConfirm } from './DeleteVersionConfirm.tsx'
import { RestoreConfirm } from './RestoreConfirm.tsx'

export type VersionAsk = 'restore' | 'delete'

/**
 * One version: when, by whom, how big; open it read-only in a new tab, download it, or restore it. The owner's menu
 * deletes an old version; the current one is never offered.
 */
export function VersionRow({ version, current, viewUrl, canDelete, asking, busy, onDownload, onAsk, onRestore, onDelete, onCancel }: {
  version: Version
  /** The document's current version number. */
  current: number
  viewUrl: string
  canDelete: boolean
  asking: VersionAsk | null
  busy: boolean
  onDownload: () => void
  onAsk: (ask: VersionAsk) => void
  onRestore: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  const view = useIcon('view')
  const download = useIcon('download')
  const restore = useIcon('restore')
  const trash = useIcon('trash')
  const isCurrent = version.version === current
  const label = `phiên bản ${version.version}`
  return <li className="erp-versions-row" data-current={isCurrent || undefined}>
    <div className="erp-versions-row__main">
      <p className="erp-versions-row__title">
        <span>Phiên bản {version.version}</span>
        {isCurrent && <span className="erp-versions-row__tag">Phiên bản hiện tại</span>}
      </p>
      <p className="erp-versions-row__meta">
        <span>{formatMoment(version.createdAt)}</span>
        {version.authorName && <span>{version.authorName}</span>}
        <span>{formatBytes(version.size)}</span>
      </p>
    </div>
    <div className="erp-versions-row__actions">
      <a className="erp-docs-icon-btn" href={viewUrl} target="_blank" rel="noopener" aria-label={`Xem ${label} (mở thẻ mới)`} title="Xem">{view}</a>
      <button type="button" className="erp-docs-icon-btn" aria-label={`Tải ${label} về máy`} title="Tải về" onClick={onDownload}>{download}</button>
      {!isCurrent && <button type="button" className="erp-btn erp-btn--secondary erp-versions-row__restore" aria-label={`Khôi phục ${label}`}
        disabled={busy} onClick={() => onAsk('restore')}>{restore}<span className="erp-versions-row__restore-label">Khôi phục</span></button>}
      {!isCurrent && canDelete && <RowMenu label={`Thao tác khác với ${label}`} items={[
        { label: 'Xoá phiên bản này', icon: trash, danger: true, onSelect: () => onAsk('delete') },
      ]} />}
    </div>
    {asking === 'restore' && <RestoreConfirm version={version.version} current={current} busy={busy} onConfirm={onRestore} onCancel={onCancel} />}
    {asking === 'delete' && !isCurrent && <DeleteVersionConfirm version={version.version} busy={busy} onConfirm={onDelete} onCancel={onCancel} />}
  </li>
}
