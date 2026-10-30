import { pageQuery } from './api.ts'
import { GET, createCaller, fetchBytes, segment } from './http.ts'
import { documentOf, versionPageOf } from './parse.ts'
import type { ApiFetch, DocumentWithTag } from './types.ts'

/** Version history calls (owner and editors): list, bytes of one version, restore as a new version; the owner deletes. */
export function createVersionsApi(apiFetch: ApiFetch) {
  const call = createCaller(apiFetch)
  const doc = (id: string, rest = '') => `/documents/${segment(id)}${rest}`
  const withTag = (body: unknown, response: Response): DocumentWithTag | null => {
    const item = documentOf(body)
    const etag = response.headers.get('ETag')
    return item && etag ? { doc: item, etag } : null
  }

  return {
    /** The document and the ETag of its current version, which a restore must name. */
    document: (id: string) => call(doc(id), GET, withTag),
    versions: (id: string, cursor: string | null = null) => call(doc(id, `/versions${pageQuery(cursor)}`), GET, versionPageOf),
    bytes: (id: string, seq: number) => fetchBytes(apiFetch, doc(id, `/versions/${seq}/content`)),
    /** 409 (`conflict`) when someone saved since `etag`: the list is stale. */
    restore: (id: string, seq: number, etag: string) =>
      call(doc(id, `/versions/${seq}/restore`), { method: 'POST', headers: { Accept: 'application/json', 'If-Match': etag } }, withTag),
    /** Owner only, never the current version; the bytes no other version shares go back to the owner's quota. */
    remove: (id: string, seq: number) => call(doc(id, `/versions/${seq}`), { method: 'DELETE', headers: { Accept: 'application/json' } }, () => true as const),
  }
}

export type VersionsApi = ReturnType<typeof createVersionsApi>
