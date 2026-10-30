import type { DocumentsApi } from './api.ts'
import type { Crumb, View } from './route.ts'
import type { Problem } from './types.ts'

export type TrailLookup =
  | { kind: 'found'; trail: Crumb[] }
  | { kind: 'notFound'; problem: Problem }
  /** Any other failure: the page keeps the nameless crumb rather than blocking the list on it. */
  | { kind: 'unknown' }

/** Only a folder reached without a history entry (link, typed URL) lacks its path; navigation carries one. */
export const needsTrailLookup = (view: View): view is Extract<View, { kind: 'folder' }> & { folderId: string } =>
  view.kind === 'folder' && view.folderId !== null && view.trail.length === 0

export async function lookUpTrail(api: Pick<DocumentsApi, 'folder'>, folderId: string): Promise<TrailLookup> {
  const result = await api.folder(folderId)
  if (!result.ok) return result.problem.kind === 'notFound' ? { kind: 'notFound', problem: result.problem } : { kind: 'unknown' }
  const { folder, ancestors } = result.value
  if (folder.id !== folderId) return { kind: 'unknown' }
  return { kind: 'found', trail: [...ancestors, folder].map(({ id, name }) => ({ id, name })) }
}
