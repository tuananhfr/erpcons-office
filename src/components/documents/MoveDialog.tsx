'use client'

import { useCallback, useState } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import type { Crumb } from '@/lib/documents/route.ts'
import type { Result } from '@/lib/documents/types.ts'
import { Dialog } from './Dialog.tsx'
import { useIcon } from './IconsContext.tsx'
import { ListSkeleton } from './StatusPanel.tsx'
import { useAction } from './use-action.ts'
import { useListing } from './use-listing.ts'

export interface MoveTarget {
  kind: 'folder' | 'document'
  id: string
  name: string
  /** Where it is now; `null` is the top level. */
  parentId: string | null
}

/** Pick a destination folder by browsing the tree; the item itself is hidden, so a folder cannot be moved into itself. */
export function MoveDialog({ api, target, onDone, onClose }: {
  api: DocumentsApi
  target: MoveTarget
  onDone: (destination: string | null) => void
  onClose: () => void
}) {
  const [trail, setTrail] = useState<Crumb[]>([])
  const here = trail.at(-1)?.id ?? null
  const load = useCallback((cursor: string | null) => api.children(here, cursor), [api, here])
  const { listing, loadMore, reload } = useListing(here ?? 'root', load)
  const { busy, problem, run } = useAction()
  const folderIcon = useIcon('folder')
  const back = useIcon('back')
  const enter = useIcon('crumb')
  const same = here === target.parentId

  async function move() {
    const send = (): Promise<Result<unknown>> => target.kind === 'folder' ? api.moveFolder(target.id, here) : api.moveDocument(target.id, here)
    if ((await run({ to: here }, send)) !== null) onDone(here)
  }

  const folders = listing.status === 'ready' ? listing.page.folders.filter((folder) => folder.id !== target.id) : []
  return <Dialog title={`Di chuyển “${target.name}”`} onClose={onClose}>
    <div className="erp-docs-dialog__body">
      <div className="erp-docs-picker__where">
        {trail.length > 0 && <button type="button" className="erp-docs-icon-btn" aria-label="Lên thư mục cha" onClick={() => setTrail(trail.slice(0, -1))}>{back}</button>}
        <p aria-live="polite"><span className="erp-sr-only">Đang xem: </span>{trail.at(-1)?.name ?? 'Tài liệu của tôi'}</p>
      </div>
      <div className="erp-docs-picker">
        {listing.status === 'loading' && <ListSkeleton />}
        {listing.status === 'error' && <p className="erp-docs-picker__empty" role="alert">{listing.problem.message} <button type="button" className="erp-docs-link-btn" onClick={() => reload()}>Thử lại</button></p>}
        {listing.status === 'ready' && (folders.length === 0
          ? <p className="erp-docs-picker__empty">Không có thư mục con.</p>
          : <ul aria-label="Thư mục con">
            {folders.map((folder) => <li key={folder.id}>
              <button type="button" className="erp-docs-picker__folder" onClick={() => setTrail([...trail, { id: folder.id, name: folder.name }])}>
                <span className="erp-docs-picker__folder-icon">{folderIcon}</span><span className="erp-docs-picker__folder-name">{folder.name}</span>{enter}
              </button>
            </li>)}
          </ul>)}
        {listing.status === 'ready' && listing.page.nextCursor && <button type="button" className="erp-docs-link-btn" onClick={() => { void loadMore() }}>Tải thêm thư mục</button>}
      </div>
      {problem
        ? <p className="erp-docs-field__error" role="alert">{problem.message}</p>
        : <p className="erp-docs-field__hint">{same ? 'Mục này đang nằm ở đây. Hãy chọn thư mục khác.' : 'Mở thư mục muốn chuyển tới rồi bấm “Chuyển vào đây”.'}</p>}
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" onClick={onClose}>Huỷ</button>
        <button type="button" className="erp-btn erp-btn--primary" disabled={busy || same} aria-busy={busy} onClick={() => { void move() }}>{busy ? 'Đang chuyển…' : 'Chuyển vào đây'}</button>
      </div>
    </div>
  </Dialog>
}
