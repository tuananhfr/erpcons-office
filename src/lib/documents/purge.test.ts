import { describe, expect, it } from 'vitest'
import { createDocumentsApi } from './api.ts'
import { createIdempotency } from './idempotency.ts'
import { MESSAGES } from './problem.ts'
import { createPurge } from './purge.ts'

const DOC_ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const FOLDER_ID = '0b8f3a52-5d9e-4c1f-9a51-2f4a9d6c7e10'

function server(statuses: number[]) {
  const calls: Array<{ method: string; path: string; key: string | null }> = []
  const api = createDocumentsApi(async (path, init = {}) => {
    calls.push({ method: String(init.method), path, key: new Headers(init.headers).get('Idempotency-Key') })
    const status = statuses.shift() ?? 204
    if (status === 204) return new Response(null, { status })
    const code = status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE'
    return new Response(JSON.stringify({ code, message_vi: 'x', request_id: 'r', retryable: status === 503 }), { status, headers: { 'Content-Type': 'application/json' } })
  })
  let n = 0
  const purge = createPurge(api, createIdempotency(() => `key-${++n}`))
  return { purge, calls }
}

describe('permanent delete from the trash', () => {
  it('purges a document and a folder on their own paths', async () => {
    const { purge, calls } = server([204, 204])
    expect(await purge({ kind: 'document', id: DOC_ID })).toEqual({ kind: 'purged' })
    expect(await purge({ kind: 'folder', id: FOLDER_ID })).toEqual({ kind: 'purged' })
    expect(calls).toEqual([
      { method: 'POST', path: `/api/v1/documents/${DOC_ID}/purge`, key: 'key-1' },
      { method: 'POST', path: `/api/v1/folders/${FOLDER_ID}/purge`, key: 'key-2' },
    ])
  })

  it('retries a failed purge with the same key, so a lost 204 is not turned into a 404', async () => {
    const { purge, calls } = server([503, 204])
    const first = await purge({ kind: 'document', id: DOC_ID })
    expect(first).toMatchObject({ kind: 'failed', problem: { kind: 'busy', retryable: true } })
    expect(await purge({ kind: 'document', id: DOC_ID })).toEqual({ kind: 'purged' })
    expect(calls.map((c) => c.key)).toEqual(['key-1', 'key-1'])
  })

  it('reports an item already gone (404) apart from a failure, with the not-found sentence', async () => {
    const { purge, calls } = server([404, 204])
    expect(await purge({ kind: 'folder', id: FOLDER_ID })).toEqual({ kind: 'gone', problem: expect.objectContaining({ message: MESSAGES.notFound }) })
    // A definite answer ends the action: a later purge of the same item is a new request.
    await purge({ kind: 'folder', id: FOLDER_ID })
    expect(calls.map((c) => c.key)).toEqual(['key-1', 'key-2'])
  })
})
