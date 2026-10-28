'use client'

import type { MouseEvent, ReactNode } from 'react'
import { formatBytes, formatUpdated, trashDaysLeft, trashNote } from '@/lib/documents/display.ts'
import { documentUrl, kindInfo } from '@/lib/documents/formats.ts'
import type { DocumentItem, Folder, Page } from '@/lib/documents/types.ts'
import type { Row } from './ItemList.tsx'
import type { MoveTarget } from './MoveDialog.tsx'
import { plainClick } from './plain-click.ts'

export const targetOfFolder = (folder: Folder): MoveTarget => ({ kind: 'folder', id: folder.id, name: folder.name, parentId: folder.parentId })
export const targetOfDocument = (doc: DocumentItem): MoveTarget => ({ kind: 'document', id: doc.id, name: doc.title, parentId: doc.folderId })

/** Rows of a folder: folders open in place, documents open their editor (`/<editor>/?doc=<id>`). */
export function folderRows(page: Page, openFolder: (folder: Folder) => void, menu: (target: MoveTarget, open: () => void) => ReactNode): Row[] {
  const folders = page.folders.map((folder): Row => {
    const href = `#thu-muc=${folder.id}`
    return {
      key: `f:${folder.id}`, icon: 'folder', name: folder.name, href, type: 'Thư mục', updated: formatUpdated(folder.updatedAt), size: '',
      onOpen: (event: MouseEvent<HTMLAnchorElement>) => {
        if (!plainClick(event)) return
        event.preventDefault()
        openFolder(folder)
      },
      action: menu(targetOfFolder(folder), () => openFolder(folder)),
    }
  })
  const documents = page.documents.map((doc): Row => {
    const href = documentUrl(doc)
    return {
      key: `d:${doc.id}`, icon: doc.format, name: doc.title, href, type: kindInfo(doc.format).label,
      updated: formatUpdated(doc.updatedAt), size: formatBytes(doc.size), action: menu(targetOfDocument(doc), () => window.location.assign(href)),
    }
  })
  return [...folders, ...documents]
}

/** Rows of the trash: nothing opens from there; the one action is restore. */
export function trashRows(page: Page, restore: (target: MoveTarget) => ReactNode): Row[] {
  const now = Date.now()
  const folders = page.folders.map((folder): Row => ({
    key: `f:${folder.id}`, icon: 'folder', name: folder.name, type: 'Thư mục', size: '',
    updated: folder.trashedAt ? formatUpdated(folder.trashedAt) : '', note: trashNote(trashDaysLeft(folder.trashedAt, now)),
    action: restore(targetOfFolder(folder)),
  }))
  const documents = page.documents.map((doc): Row => ({
    key: `d:${doc.id}`, icon: doc.format, name: doc.title, type: kindInfo(doc.format).label, size: formatBytes(doc.size),
    updated: doc.trashedAt ? formatUpdated(doc.trashedAt) : '', note: trashNote(trashDaysLeft(doc.trashedAt, now)),
    action: restore(targetOfDocument(doc)),
  }))
  return [...folders, ...documents]
}
