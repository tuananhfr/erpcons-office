/** Shapes of the Office API (erpcons-office-server/docs/openapi.yaml) as the /tai-lieu/ page uses them. */

export type Kind = 'word' | 'sheet' | 'slide' | 'pdf'
export type Format = 'docx' | 'xlsx' | 'pptx' | 'pdf'
/** The caller's role on a document; `link` is anyone holding the public view link. */
export type Role = 'owner' | 'editor' | 'commenter' | 'viewer' | 'link'
/** A role the owner can give by email. */
export type GrantRole = 'editor' | 'commenter' | 'viewer'

export interface Folder {
  id: string
  parentId: string | null
  name: string
  trashedAt: string | null
  updatedAt: string
}

export interface DocumentItem {
  id: string
  folderId: string | null
  title: string
  kind: Kind
  format: Format
  size: number
  version: number
  trashedAt: string | null
  updatedAt: string
  role: Role
  /** The owner's display name; may be empty. */
  ownerName: string
  /** At least one permission, pending invitation or the public link is in force. */
  shared: boolean
  canDownload: boolean
  /** The caller may change permissions and the link (owner; editors while the owner allows it). */
  canShare: boolean
}

/** A document in "Được chia sẻ với tôi". */
export interface SharedDocument extends DocumentItem {
  sharedAt: string
  /** Not yet marked seen. */
  isNew: boolean
}

export interface SharedPage {
  documents: SharedDocument[]
  unseen: number
  nextCursor: string | null
}

export interface Person {
  actorId: string
  displayName: string
  email: string | null
}

export interface Permission {
  id: string
  actorId: string | null
  displayName: string | null
  email: string | null
  role: GrantRole
  pending: boolean
  createdAt: string
  expiresAt: string | null
}

export interface ShareSettings {
  editorsCanShare: boolean
  viewersCanDownload: boolean
}

export interface LinkState {
  enabled: boolean
  expiresAt: string | null
  /** Only for people who can share, while the link is on. Memory only: never stored or logged. */
  token: string | null
}

/** `GET /documents/{id}/permissions`: what the share dialog shows. */
export interface Sharing {
  role: Role
  owner: Person
  /** Oldest first, at most 500 of them. */
  permissions: Permission[]
  /** How many the caller could see in all; more than `permissions` holds only past 500. */
  total: number
  settings: ShareSettings
  link: LinkState
  canShare: boolean
}

/** `POST /permissions` answers the sharing, plus how many emails the owner's daily cap held back. */
export interface InviteResult {
  sharing: Sharing
  mailSkipped: number
}

export interface Version {
  version: number
  size: number
  authorName: string
  createdAt: string
}

export interface VersionPage {
  versions: Version[]
  nextCursor: string | null
}

/** `GET /documents/{id}` with the ETag a restore names in If-Match. */
export interface DocumentWithTag {
  doc: DocumentItem
  etag: string
}

/** `GET /folders/{id}`: the folder and its ancestors from the top level down to its parent. */
export interface FolderPath {
  folder: Folder
  ancestors: Folder[]
}

export interface Page {
  folders: Folder[]
  documents: DocumentItem[]
  nextCursor: string | null
}

export interface Quota {
  usedBytes: number
  limitBytes: number
  maxFileBytes: number
}

export type ProblemKind =
  | 'notFound' | 'signIn' | 'offline' | 'nameTaken' | 'quota' | 'tooLarge' | 'cycle' | 'unsupported' | 'invalid' | 'busy' | 'failed'
  | 'forbidden' | 'conflict' | 'shareLimit' | 'currentVersion'

export interface Problem {
  kind: ProblemKind
  /** Vietnamese, ready to show. */
  message: string
  retryable: boolean
  retryAfter: number | null
}

export type Result<T> = { ok: true; value: T } | { ok: false; problem: Problem }

/** `erpAccount.apiFetch`: same-origin `/api/v1/` only, token attached (src/lib/account/types.ts). */
export type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>
