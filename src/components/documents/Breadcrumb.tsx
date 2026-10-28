'use client'

import type { Crumb } from '@/lib/documents/route.ts'
import { useIcon } from './IconsContext.tsx'
import { plainClick } from './plain-click.ts'

/**
 * Path from the top level to the current folder. `trail` is empty for a folder opened by its link alone (its name is
 * unknown until we pass through its parent), shown as "Thư mục này".
 */
export function Breadcrumb({ folderId, trail, onNavigate }: {
  folderId: string | null
  trail: Crumb[]
  onNavigate: (folderId: string | null, trail: Crumb[]) => void
}) {
  const home = useIcon('home')
  const separator = useIcon('crumb')
  const crumbs: Array<{ id: string | null; name: string; trail: Crumb[] }> = [{ id: null, name: 'Tài liệu của tôi', trail: [] }]
  trail.forEach((crumb, i) => crumbs.push({ id: crumb.id, name: crumb.name, trail: trail.slice(0, i + 1) }))
  if (folderId && trail.length === 0) crumbs.push({ id: folderId, name: 'Thư mục này', trail: [] })
  return <nav className="erp-docs-crumbs" aria-label="Vị trí thư mục">
    <ol>
      {crumbs.map((crumb, i) => {
        const last = i === crumbs.length - 1
        return <li key={crumb.id ?? 'root'}>
          {i > 0 && <span className="erp-docs-crumbs__sep">{separator}</span>}
          {last
            ? <span className="erp-docs-crumbs__current" aria-current="location">{i === 0 && home}{crumb.name}</span>
            : <a href={crumb.id ? `#thu-muc=${crumb.id}` : '#'} onClick={(event) => {
              if (!plainClick(event)) return
              event.preventDefault()
              onNavigate(crumb.id, crumb.trail)
            }}>{i === 0 && home}{crumb.name}</a>}
        </li>
      })}
    </ol>
  </nav>
}
