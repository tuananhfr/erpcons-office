/** Shapes of the Office API (erpcons-office-server/docs/openapi.yaml) as the /tai-lieu/ page uses them. */

export type Kind = 'word' | 'sheet' | 'slide' | 'pdf'
export type Format = 'docx' | 'xlsx' | 'pptx' | 'pdf'

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
