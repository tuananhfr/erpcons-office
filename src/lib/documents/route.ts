/**
 * The page's place lives in the URL fragment (`#thu-muc=<id>`, `#chia-se`, `#thung-rac`): it survives a reload and the back
 * button, and never reaches the server's access log the way a query string would.
 */
export interface Crumb {
  id: string
  name: string
}

export type View =
  | { kind: 'folder'; folderId: string | null; trail: Crumb[] }
  | { kind: 'shared' }
  | { kind: 'trash' }

export const ROOT_VIEW: View = { kind: 'folder', folderId: null, trail: [] }
const FOLDER_PREFIX = '#thu-muc='
const TRASH_HASH = '#thung-rac'
const SHARED_HASH = '#chia-se'
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function viewHash(view: View): string {
  if (view.kind === 'trash') return TRASH_HASH
  if (view.kind === 'shared') return SHARED_HASH
  return view.folderId ? `${FOLDER_PREFIX}${view.folderId}` : ''
}

const isCrumb = (value: unknown): value is Crumb =>
  Boolean(value) && typeof (value as Crumb).id === 'string' && typeof (value as Crumb).name === 'string'

// Kept under one key of `history.state`: Next's router keeps its own entries there too.
const STATE_KEY = 'erpDocs'

/** `state` is `history.state`: folder names are kept there, so moving around never asks the server for them again. */
export function parseView(hash: string, state: unknown): View {
  if (hash === TRASH_HASH) return { kind: 'trash' }
  if (hash === SHARED_HASH) return { kind: 'shared' }
  if (!hash.startsWith(FOLDER_PREFIX)) return ROOT_VIEW
  const folderId = hash.slice(FOLDER_PREFIX.length)
  if (!ID.test(folderId)) return ROOT_VIEW
  const own = state && typeof state === 'object' ? (state as Record<string, unknown>)[STATE_KEY] : null
  const trail = own && typeof own === 'object' && Array.isArray((own as { trail?: unknown }).trail) ? (own as { trail: unknown[] }).trail : []
  const crumbs = trail.filter(isCrumb).map(({ id, name }) => ({ id, name }))
  // A trail that does not end at this folder belongs to another entry; it would show a wrong path.
  return { kind: 'folder', folderId, trail: crumbs.at(-1)?.id === folderId ? crumbs : [] }
}

/** The history entry for `view`, keeping whatever else `current` holds. */
export function viewState(view: View, current: unknown): Record<string, unknown> {
  const base = current && typeof current === 'object' ? { ...(current as Record<string, unknown>) } : {}
  base[STATE_KEY] = view.kind === 'folder' ? { trail: view.trail } : null
  return base
}
