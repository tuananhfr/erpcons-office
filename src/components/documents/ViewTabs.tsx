'use client'

import type { View } from '@/lib/documents/route.ts'
import { useIcon } from './IconsContext.tsx'

/** Switch between my documents, the ones shared with me and the trash; each is a place in the URL fragment. */
export function ViewTabs({ view, unseen, onDocuments, onShared, onTrash }: {
  view: View
  /** Shared documents not opened yet: a dot on the tab, the count for screen readers. */
  unseen: number
  onDocuments: () => void
  onShared: () => void
  onTrash: () => void
}) {
  const folder = useIcon('folder')
  const shared = useIcon('shared')
  const trash = useIcon('trash')
  const current = (kind: View['kind']) => (view.kind === kind ? 'page' as const : undefined)
  const go = (run: () => void) => (event: { preventDefault: () => void }) => { event.preventDefault(); run() }
  return <nav className="erp-docs-tabs" aria-label="Khu vực">
    <a href="#" aria-current={current('folder')} onClick={go(onDocuments)}>{folder}<span>Tài liệu</span></a>
    <a href="#chia-se" aria-current={current('shared')} onClick={go(onShared)}>
      {shared}<span>Được chia sẻ<span className="erp-docs-tabs__long"> với tôi</span></span>
      {unseen > 0 && <span className="erp-docs-tabs__dot"><span className="erp-sr-only">, {unseen} mục mới</span></span>}
    </a>
    <a href="#thung-rac" aria-current={current('trash')} onClick={go(onTrash)}>{trash}<span>Thùng rác</span></a>
  </nav>
}
