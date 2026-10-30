'use client'

import type { Crumb } from '@/lib/documents/route.ts'
import { useIcon } from './IconsContext.tsx'
import { plainClick } from './plain-click.ts'

/**
 * Path from the top level to the current folder. A folder opened by its link alone has an empty `trail` until its
 * path is looked up (`pending`, a placeholder); if that lookup fails it stays "Thư mục này".
 */
export function Breadcrumb({ folderId, trail, pending = false, onNavigate }: {
  folderId: string | null
  trail: Crumb[]
  pending?: boolean
  onNavigate: (folderId: string | null, trail: Crumb[]) => void
}) {
  const home = useIcon('home')
  const separator = useIcon('crumb')
  const crumbs: Array<{ id: string | null; name: string; trail: Crumb[] }> = [{ id: null, name: 'Tài liệu của tôi', trail: [] }]
  trail.forEach((crumb, i) => crumbs.push({ id: crumb.id, name: crumb.name, trail: trail.slice(0, i + 1) }))
  if (folderId && trail.length === 0) crumbs.push({ id: folderId, name: 'Thư mục này', trail: [] })
  return <nav className="erp-docs-crumbs" aria-label="Vị trí thư mục" aria-busy={pending || undefined}>
    <ol>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1
        let body
        if (last && pending && i > 0) {
          body = <span className="erp-docs-crumbs__current erp-docs-crumbs__pending" aria-current="location"><span className="erp-sr-only">Đang tải tên thư mục</span></span>
        } else if (last) {
          body = <span className="erp-docs-crumbs__current" aria-current="location">{i === 0 && home}{crumb.name}</span>
        } else {
          body = <a href={crumb.id ? `#thu-muc=${crumb.id}` : '#'} onClick={(event) => {
            if (!plainClick(event)) return
            event.preventDefault()
            onNavigate(crumb.id, crumb.trail)
          }}>{i === 0 && home}{crumb.name}</a>
        }
        return <li key={crumb.id ?? 'root'}>
          {i > 0 && <span className="erp-docs-crumbs__sep">{separator}</span>}
          {body}
        </li>
      })}
    </ol>
  </nav>
}
