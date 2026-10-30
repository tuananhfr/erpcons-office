import { GET, createCaller, segment, send } from './http.ts'
import { documentOf, folderOf, folderPathOf, pageOf, quotaOf } from './parse.ts'
import type { ApiFetch, Kind } from './types.ts'

const PAGE_SIZE = 50

export const pageQuery = (cursor: string | null) => `?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

/** The Office API calls of the /tai-lieu/ page; every one goes through `apiFetch` and resolves to a Result. */
export function createDocumentsApi(apiFetch: ApiFetch) {
  const call = createCaller(apiFetch)
  const none = () => true as const
  // Purge takes no body; the key makes a retry after a lost 204 harmless.
  const purge = (key: string): RequestInit => ({ method: 'POST', headers: { Accept: 'application/json', 'Idempotency-Key': key } })

  return {
    quota: () => call('/me', GET, quotaOf),
    children: (folderId: string | null, cursor: string | null = null) =>
      call(`/folders/${folderId ? segment(folderId) : 'root'}/children${pageQuery(cursor)}`, GET, pageOf),
    trash: (cursor: string | null = null) => call(`/trash${pageQuery(cursor)}`, GET, pageOf),
    folder: (id: string) => call(`/folders/${segment(id)}`, GET, folderPathOf),

    createFolder: (parentId: string | null, name: string, key: string) =>
      call('/folders', send('POST', { parent_id: parentId, name }, key), folderOf),
    renameFolder: (id: string, name: string) => call(`/folders/${segment(id)}`, send('PATCH', { name }), folderOf),
    moveFolder: (id: string, parentId: string | null) => call(`/folders/${segment(id)}`, send('PATCH', { parent_id: parentId }), folderOf),
    trashFolder: (id: string) => call(`/folders/${segment(id)}`, { method: 'DELETE' }, none),
    restoreFolder: (id: string) => call(`/folders/${segment(id)}/restore`, { method: 'POST', headers: { Accept: 'application/json' } }, folderOf),
    purgeFolder: (id: string, key: string) => call(`/folders/${segment(id)}/purge`, purge(key), none),

    createBlank: (kind: Kind, title: string, folderId: string | null, key: string) =>
      call('/documents', send('POST', { kind, title, folder_id: folderId }, key), documentOf),
    upload: (file: File, folderId: string | null, key: string) => {
      const form = new FormData()
      // No title: the server takes the file name without its extension, or its default when that name is not valid.
      form.append('file', file, file.name)
      if (folderId) form.append('folder_id', folderId)
      return call('/documents', { method: 'POST', headers: { Accept: 'application/json', 'Idempotency-Key': key }, body: form }, documentOf)
    },
    renameDocument: (id: string, title: string) => call(`/documents/${segment(id)}`, send('PATCH', { title }), documentOf),
    moveDocument: (id: string, folderId: string | null) => call(`/documents/${segment(id)}`, send('PATCH', { folder_id: folderId }), documentOf),
    trashDocument: (id: string) => call(`/documents/${segment(id)}`, { method: 'DELETE' }, none),
    restoreDocument: (id: string) => call(`/documents/${segment(id)}/restore`, { method: 'POST', headers: { Accept: 'application/json' } }, documentOf),
    purgeDocument: (id: string, key: string) => call(`/documents/${segment(id)}/purge`, purge(key), none),
  }
}

export type DocumentsApi = ReturnType<typeof createDocumentsApi>
