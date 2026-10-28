import { problem, problemFromError, problemFromResponse } from './problem.ts'
import type { ApiFetch, DocumentItem, Folder, Format, Kind, Page, Quota, Result } from './types.ts'

const BASE = '/api/v1'
const PAGE_SIZE = 50
const KINDS: readonly Kind[] = ['word', 'sheet', 'slide', 'pdf']
const FORMATS: readonly Format[] = ['docx', 'xlsx', 'pptx', 'pdf']
const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' }
// Anything the page cannot read is treated like a hiccup of the server, never as data.
const MALFORMED = problem('failed', null, true)

type Raw = Record<string, unknown>
const isRaw = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null)

function folderOf(raw: unknown): Folder | null {
  if (!isRaw(raw) || !text(raw.id) || text(raw.name) === null) return null
  return { id: raw.id as string, parentId: text(raw.parent_id), name: raw.name as string, trashedAt: text(raw.trashed_at), updatedAt: text(raw.updated_at) ?? '' }
}

function documentOf(raw: unknown): DocumentItem | null {
  if (!isRaw(raw) || !text(raw.id) || text(raw.title) === null) return null
  const kind = KINDS.find((k) => k === raw.kind)
  const format = FORMATS.find((f) => f === raw.format)
  const size = count(raw.size)
  const version = count(raw.version)
  if (!kind || !format || size === null || !version) return null
  return {
    id: raw.id as string, folderId: text(raw.folder_id), title: raw.title as string, kind, format, size, version,
    trashedAt: text(raw.trashed_at), updatedAt: text(raw.updated_at) ?? '',
  }
}

function pageOf(raw: unknown): Page | null {
  if (!isRaw(raw) || !Array.isArray(raw.folders) || !Array.isArray(raw.documents)) return null
  const folders = raw.folders.map(folderOf)
  const documents = raw.documents.map(documentOf)
  if (folders.includes(null) || documents.includes(null)) return null
  return { folders: folders as Folder[], documents: documents as DocumentItem[], nextCursor: text(raw.next_cursor) }
}

function quotaOf(raw: unknown): Quota | null {
  const quota = isRaw(raw) && isRaw(raw.quota) ? raw.quota : null
  if (!quota) return null
  const used = count(quota.used_bytes)
  const limit = count(quota.limit_bytes)
  const maxFile = count(quota.max_file_bytes)
  return used === null || limit === null || maxFile === null ? null : { usedBytes: used, limitBytes: limit, maxFileBytes: maxFile }
}

const segment = (id: string) => encodeURIComponent(id)
const query = (cursor: string | null) => `?limit=${PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`

/** The Office API calls of the /tai-lieu/ page; every one goes through `apiFetch` and resolves to a Result. */
export function createDocumentsApi(apiFetch: ApiFetch) {
  async function call<T>(path: string, init: RequestInit, read: (body: unknown) => T | null): Promise<Result<T>> {
    let response: Response
    try {
      response = await apiFetch(`${BASE}${path}`, init)
    } catch (error) {
      return { ok: false, problem: problemFromError(error) }
    }
    if (!response.ok) return { ok: false, problem: await problemFromResponse(response) }
    let body: unknown = null
    if (response.status !== 204) {
      try {
        const raw = await response.text()
        body = raw ? JSON.parse(raw) : null
      } catch {
        return { ok: false, problem: MALFORMED }
      }
    }
    const value = read(body)
    return value === null ? { ok: false, problem: MALFORMED } : { ok: true, value }
  }
  const none = () => true as const
  const get = { method: 'GET', headers: { Accept: 'application/json' } }
  const send = (method: string, body?: unknown, key?: string): RequestInit => ({
    method,
    headers: key ? { ...JSON_HEADERS, 'Idempotency-Key': key } : JSON_HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  return {
    quota: () => call('/me', get, quotaOf),
    children: (folderId: string | null, cursor: string | null = null) =>
      call(`/folders/${folderId ? segment(folderId) : 'root'}/children${query(cursor)}`, get, pageOf),
    trash: (cursor: string | null = null) => call(`/trash${query(cursor)}`, get, pageOf),

    createFolder: (parentId: string | null, name: string, key: string) =>
      call('/folders', send('POST', { parent_id: parentId, name }, key), folderOf),
    renameFolder: (id: string, name: string) => call(`/folders/${segment(id)}`, send('PATCH', { name }), folderOf),
    moveFolder: (id: string, parentId: string | null) => call(`/folders/${segment(id)}`, send('PATCH', { parent_id: parentId }), folderOf),
    trashFolder: (id: string) => call(`/folders/${segment(id)}`, { method: 'DELETE' }, none),
    restoreFolder: (id: string) => call(`/folders/${segment(id)}/restore`, { method: 'POST', headers: { Accept: 'application/json' } }, folderOf),

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
  }
}

export type DocumentsApi = ReturnType<typeof createDocumentsApi>
