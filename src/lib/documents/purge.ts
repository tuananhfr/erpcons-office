import type { DocumentsApi } from './api.ts'
import { createIdempotency, type Idempotency } from './idempotency.ts'
import type { Problem } from './types.ts'

export interface PurgeTarget {
  kind: 'folder' | 'document'
  id: string
}

export type PurgeOutcome =
  | { kind: 'purged' }
  /** 404: purged from another tab or past its 30 days. Nothing left to do but refresh the list. */
  | { kind: 'gone'; problem: Problem }
  | { kind: 'failed'; problem: Problem }

/**
 * Permanent delete of one trashed item. The same Idempotency-Key is sent again after a retryable failure, so a
 * purge whose 204 was lost is answered from the server's record instead of a 404.
 */
export function createPurge(api: Pick<DocumentsApi, 'purgeFolder' | 'purgeDocument'>, idempotency: Idempotency = createIdempotency()) {
  return async (target: PurgeTarget): Promise<PurgeOutcome> => {
    const key = idempotency.keyFor({ purge: target.kind, id: target.id })
    const result = target.kind === 'folder' ? await api.purgeFolder(target.id, key) : await api.purgeDocument(target.id, key)
    if (result.ok || !result.problem.retryable) idempotency.reset()
    if (result.ok) return { kind: 'purged' }
    if (result.problem.kind === 'notFound') return { kind: 'gone', problem: result.problem }
    return { kind: 'failed', problem: result.problem }
  }
}
