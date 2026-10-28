import { describe, expect, it } from 'vitest'
import { createDocumentsApi } from './api.ts'
import { lookUpTrail, needsTrailLookup } from './deep-link.ts'
import { MESSAGES } from './problem.ts'
import { parseView, viewState } from './route.ts'

const TOP = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const MID = '0b8f3a52-5d9e-4c1f-9a51-2f4a9d6c7e10'
const LEAF = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

const folder = (id: string, name: string, parent: string | null) => ({ id, parent_id: parent, name, state: 'ACTIVE', trashed_at: null, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z' })

function fake(status: number, body: unknown) {
  const paths: string[] = []
  const api = createDocumentsApi(async (path) => {
    paths.push(path)
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return { api, paths }
}

describe('breadcrumb of a folder opened from its link', () => {
  it('asks the server only when history has no path for the folder', () => {
    const linked = parseView(`#thu-muc=${LEAF}`, null)
    expect(needsTrailLookup(linked)).toBe(true)
    const walked = parseView(`#thu-muc=${LEAF}`, viewState({ kind: 'folder', folderId: LEAF, trail: [{ id: TOP, name: 'Hợp đồng' }, { id: LEAF, name: 'Phụ lục' }] }, null))
    expect(needsTrailLookup(walked)).toBe(false)
    expect(needsTrailLookup(parseView('', null))).toBe(false)
    expect(needsTrailLookup(parseView('#thung-rac', null))).toBe(false)
  })

  it('builds the trail from the top level down to the folder itself', async () => {
    const { api, paths } = fake(200, { folder: folder(LEAF, 'Phụ lục', MID), ancestors: [folder(TOP, 'Hợp đồng', null), folder(MID, 'Năm 2026', TOP)] })
    expect(await lookUpTrail(api, LEAF)).toEqual({
      kind: 'found',
      trail: [{ id: TOP, name: 'Hợp đồng' }, { id: MID, name: 'Năm 2026' }, { id: LEAF, name: 'Phụ lục' }],
    })
    expect(paths).toEqual([`/api/v1/folders/${LEAF}`])
  })

  it('keeps the trail it found in the history entry, so a reload or back does not ask again', async () => {
    const { api } = fake(200, { folder: folder(LEAF, 'Phụ lục', TOP), ancestors: [folder(TOP, 'Hợp đồng', null)] })
    const found = await lookUpTrail(api, LEAF)
    if (found.kind !== 'found') throw new Error('expected a trail')
    const state = viewState({ kind: 'folder', folderId: LEAF, trail: found.trail }, { __NA: true })
    const reloaded = parseView(`#thu-muc=${LEAF}`, state)
    expect(reloaded).toEqual({ kind: 'folder', folderId: LEAF, trail: found.trail })
    expect(needsTrailLookup(reloaded)).toBe(false)
    expect(state.__NA).toBe(true)
  })

  it('turns a 404 into the one not-found sentence', async () => {
    const { api } = fake(404, { code: 'NOT_FOUND', message_vi: 'x', request_id: 'r', retryable: false })
    expect(await lookUpTrail(api, LEAF)).toEqual({ kind: 'notFound', problem: expect.objectContaining({ kind: 'notFound', message: MESSAGES.notFound }) })
  })

  it('falls back to the nameless crumb on any other failure or a mismatched answer', async () => {
    expect(await lookUpTrail(fake(503, { code: 'UNAVAILABLE', message_vi: 'x', request_id: 'r', retryable: true }).api, LEAF)).toEqual({ kind: 'unknown' })
    expect(await lookUpTrail(fake(200, { folder: folder(MID, 'Khác', null), ancestors: [] }).api, LEAF)).toEqual({ kind: 'unknown' })
  })
})
