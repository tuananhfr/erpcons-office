'use client'

import type { View } from '@/lib/documents/route.ts'
import { useIcon } from './IconsContext.tsx'

/** Switch between the documents and the trash; both are places in the URL fragment. */
export function ViewTabs({ view, onDocuments, onTrash }: { view: View; onDocuments: () => void; onTrash: () => void }) {
  const folder = useIcon('folder')
  const trash = useIcon('trash')
  const inTrash = view.kind === 'trash'
  return <nav className="erp-docs-tabs" aria-label="Khu vực">
    <a href="#" aria-current={inTrash ? undefined : 'page'} onClick={(event) => { event.preventDefault(); onDocuments() }}>{folder}Tài liệu</a>
    <a href="#thung-rac" aria-current={inTrash ? 'page' : undefined} onClick={(event) => { event.preventDefault(); onTrash() }}>{trash}Thùng rác</a>
  </nav>
}
