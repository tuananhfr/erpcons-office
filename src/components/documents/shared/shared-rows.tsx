'use client'

import type { MouseEvent, ReactNode } from 'react'
import { formatBytes, formatUpdated } from '@/lib/documents/display.ts'
import { documentUrl, kindInfo } from '@/lib/documents/formats.ts'
import type { SharedDocument } from '@/lib/documents/types.ts'
import type { Row } from '../ItemList.tsx'
import { opensElsewhere, plainClick } from '../plain-click.ts'

/**
 * Rows of "Được chia sẻ với tôi": the owner's name, when it was shared, and a "Mới" mark until first opened.
 * `seen` runs when the browser opens the document in another tab or window, since this page then stays.
 */
export function sharedRows(documents: SharedDocument[], open: (doc: SharedDocument) => void, menu: (doc: SharedDocument) => ReactNode,
  seen: (doc: SharedDocument) => void = () => {}): Row[] {
  return documents.map((doc): Row => ({
    key: `s:${doc.id}`, icon: doc.format, name: doc.title, href: documentUrl(doc), type: kindInfo(doc.format).label,
    owner: doc.ownerName ? `Của ${doc.ownerName}` : undefined, isNew: doc.isNew,
    updated: formatUpdated(doc.sharedAt), size: formatBytes(doc.size),
    onOpen: (event: MouseEvent<HTMLAnchorElement>) => {
      if (plainClick(event)) {
        event.preventDefault()
        open(doc)
      } else if (opensElsewhere(event)) {
        seen(doc)
      }
    },
    action: menu(doc),
  }))
}
