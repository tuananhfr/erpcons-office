import { count, isRaw, text } from './http.ts'
import type {
  DocumentItem, Folder, FolderPath, Format, GrantRole, InviteResult, Kind, Page, Permission, Person, Quota, Role, SharedDocument,
  SharedPage, ShareSettings, Sharing, Version, VersionPage,
} from './types.ts'

/** Readers of the Office API's JSON (erpcons-office-server/docs/openapi.yaml); null for anything malformed. */

const KINDS: readonly Kind[] = ['word', 'sheet', 'slide', 'pdf']
const FORMATS: readonly Format[] = ['docx', 'xlsx', 'pptx', 'pdf']
const ROLES: readonly Role[] = ['owner', 'editor', 'commenter', 'viewer', 'link']
export const GRANT_ROLES: readonly GrantRole[] = ['viewer', 'commenter', 'editor']

const bool = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null)
const all = <T,>(items: (T | null)[]): T[] | null => (items.includes(null) ? null : items as T[])

export function folderOf(raw: unknown): Folder | null {
  if (!isRaw(raw) || !text(raw.id) || text(raw.name) === null) return null
  return { id: raw.id as string, parentId: text(raw.parent_id), name: raw.name as string, trashedAt: text(raw.trashed_at), updatedAt: text(raw.updated_at) ?? '' }
}

export function folderPathOf(raw: unknown): FolderPath | null {
  if (!isRaw(raw) || !Array.isArray(raw.ancestors)) return null
  const folder = folderOf(raw.folder)
  const ancestors = all(raw.ancestors.map(folderOf))
  if (!folder || !ancestors) return null
  return { folder, ancestors }
}

export function documentOf(raw: unknown): DocumentItem | null {
  if (!isRaw(raw) || !text(raw.id) || text(raw.title) === null) return null
  const kind = KINDS.find((k) => k === raw.kind)
  const format = FORMATS.find((f) => f === raw.format)
  const size = count(raw.size)
  const version = count(raw.version)
  if (!kind || !format || size === null || !version) return null
  return {
    id: raw.id as string, folderId: text(raw.folder_id), title: raw.title as string, kind, format, size, version,
    trashedAt: text(raw.trashed_at), updatedAt: text(raw.updated_at) ?? '',
    // An unknown role is read as the narrowest one; the server enforces the real one anyway.
    role: ROLES.find((r) => r === raw.role) ?? 'viewer',
    ownerName: text(raw.owner_name) ?? '',
    shared: raw.shared === true,
    canDownload: raw.can_download !== false,
    // Servers before can_share: the role alone decides, as before.
    canShare: raw.can_share !== false,
  }
}

export function pageOf(raw: unknown): Page | null {
  if (!isRaw(raw) || !Array.isArray(raw.folders) || !Array.isArray(raw.documents)) return null
  const folders = all(raw.folders.map(folderOf))
  const documents = all(raw.documents.map(documentOf))
  if (!folders || !documents) return null
  return { folders, documents, nextCursor: text(raw.next_cursor) }
}

export function quotaOf(raw: unknown): Quota | null {
  const quota = isRaw(raw) && isRaw(raw.quota) ? raw.quota : null
  if (!quota) return null
  const used = count(quota.used_bytes)
  const limit = count(quota.limit_bytes)
  const maxFile = count(quota.max_file_bytes)
  return used === null || limit === null || maxFile === null ? null : { usedBytes: used, limitBytes: limit, maxFileBytes: maxFile }
}

function sharedDocumentOf(raw: unknown): SharedDocument | null {
  const doc = documentOf(raw)
  if (!doc || !isRaw(raw)) return null
  return { ...doc, sharedAt: text(raw.shared_at) ?? '', isNew: raw.new === true }
}

export function sharedPageOf(raw: unknown): SharedPage | null {
  if (!isRaw(raw) || !Array.isArray(raw.documents)) return null
  const documents = all(raw.documents.map(sharedDocumentOf))
  const unseen = count(raw.unseen)
  if (!documents || unseen === null) return null
  return { documents, unseen, nextCursor: text(raw.next_cursor) }
}

function personOf(raw: unknown): Person | null {
  if (!isRaw(raw) || !text(raw.actor_id)) return null
  return { actorId: raw.actor_id as string, displayName: text(raw.display_name) ?? '', email: text(raw.email) }
}

export function permissionOf(raw: unknown): Permission | null {
  if (!isRaw(raw) || !text(raw.id)) return null
  const role = GRANT_ROLES.find((r) => r === raw.role)
  if (!role) return null
  return {
    id: raw.id as string, actorId: text(raw.actor_id), displayName: text(raw.display_name), email: text(raw.email), role,
    pending: raw.pending === true, createdAt: text(raw.created_at) ?? '', expiresAt: text(raw.expires_at),
  }
}

export function settingsOf(raw: unknown): ShareSettings | null {
  if (!isRaw(raw)) return null
  const editorsCanShare = bool(raw.editors_can_share)
  const viewersCanDownload = bool(raw.viewers_can_download)
  return editorsCanShare === null || viewersCanDownload === null ? null : { editorsCanShare, viewersCanDownload }
}

export function sharingOf(raw: unknown): Sharing | null {
  if (!isRaw(raw) || !Array.isArray(raw.permissions) || !isRaw(raw.link)) return null
  const role = ROLES.find((r) => r === raw.role)
  const owner = personOf(raw.owner)
  const permissions = all(raw.permissions.map(permissionOf))
  const settings = settingsOf(raw.settings)
  const enabled = bool(raw.link.enabled)
  if (!role || !owner || !permissions || !settings || enabled === null) return null
  const token = enabled ? tokenOf(raw.link.token) : null
  const total = Math.max(count(raw.total) ?? 0, permissions.length)
  return { role, owner, permissions, total, settings, link: { enabled, expiresAt: text(raw.link.expires_at), token }, canShare: raw.can_share === true }
}

export function inviteResultOf(raw: unknown): InviteResult | null {
  const sharing = sharingOf(raw)
  if (!sharing || !isRaw(raw)) return null
  return { sharing, mailSkipped: count(raw.mail_skipped) ?? 0 }
}

const tokenOf = (value: unknown): string | null => {
  const token = text(value)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null
}

/** `PUT /link`: the link's token (the same one while the link stays on). */
export function linkTokenOf(raw: unknown): string | null {
  return isRaw(raw) ? tokenOf(raw.token) : null
}

function versionOf(raw: unknown): Version | null {
  if (!isRaw(raw)) return null
  const version = count(raw.version)
  const size = count(raw.size)
  if (!version || size === null) return null
  return { version, size, authorName: text(raw.author_name) ?? '', createdAt: text(raw.created_at) ?? '' }
}

export function versionPageOf(raw: unknown): VersionPage | null {
  if (!isRaw(raw) || !Array.isArray(raw.versions)) return null
  const versions = all(raw.versions.map(versionOf))
  return versions ? { versions, nextCursor: text(raw.next_cursor) } : null
}
