import { describe, expect, it } from 'vitest'
import { createDocumentsApi } from './api.ts'
import { MESSAGES } from './problem.ts'

const FOLDER_ID = '0b8f3a52-5d9e-4c1f-9a51-2f4a9d6c7e10'
const DOC_ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'

interface Call { path: string; init: RequestInit }

function fake(respond: (call: Call) => Response | Promise<Response> = () => json(200, {})) {
  const calls: Call[] = []
  const apiFetch = async (path: string, init: RequestInit = {}) => {
    const call = { path, init }
    calls.push(call)
    return respond(call)
  }
  return { api: createDocumentsApi(apiFetch), calls }
}

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

const header = (call: Call, name: string) => new Headers(call.init.headers).get(name)
const folder = (id: string, name: string, parent: string | null = null) => ({ id, parent_id: parent, name, state: 'ACTIVE', trashed_at: null, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z' })
const doc = (id: string, title: string, format = 'docx', kind = 'word') => ({ id, folder_id: null, title, kind, format, size: 2048, version: 3, save_state: 'SERVER_DURABLE', state: 'ACTIVE', trashed_at: null, created_at: '2026-10-27T08:00:00Z', updated_at: '2026-10-27T09:00:00Z' })
const error = (status: number, code: string, retryable = false, headers: Record<string, string> = {}) =>
  json(status, { code, message_vi: 'Thông báo từ máy chủ', request_id: 'req_1', retryable }, headers)

describe('documents API: paths, methods and headers', () => {
  it('lists the top level, a folder and the trash with paging', async () => {
    const { api, calls } = fake(() => json(200, { folders: [folder(FOLDER_ID, 'Hợp đồng')], documents: [doc(DOC_ID, 'Báo cáo')], next_cursor: 'c2' }))
    const root = await api.children(null)
    await api.children(FOLDER_ID, 'c 2')
    await api.trash()
    expect(calls.map((c) => [c.init.method, c.path])).toEqual([
      ['GET', '/api/v1/folders/root/children?limit=50'],
      ['GET', `/api/v1/folders/${FOLDER_ID}/children?limit=50&cursor=c%202`],
      ['GET', '/api/v1/trash?limit=50'],
    ])
    expect(root).toEqual({
      ok: true,
      value: {
        folders: [{ id: FOLDER_ID, parentId: null, name: 'Hợp đồng', trashedAt: null, updatedAt: '2026-10-27T09:00:00Z' }],
        documents: [{ id: DOC_ID, folderId: null, title: 'Báo cáo', kind: 'word', format: 'docx', size: 2048, version: 3, trashedAt: null, updatedAt: '2026-10-27T09:00:00Z' }],
        nextCursor: 'c2',
      },
    })
  })

  it('reads the quota from /me', async () => {
    const { api, calls } = fake(() => json(200, { actor_id: 'usr_an', display_name: 'An', quota: { used_bytes: 10, limit_bytes: 100, max_file_bytes: 50 } }))
    expect(await api.quota()).toEqual({ ok: true, value: { usedBytes: 10, limitBytes: 100, maxFileBytes: 50 } })
    expect(calls[0].path).toBe('/api/v1/me')
  })

  it('sends an Idempotency-Key with every create, and only with creates', async () => {
    const { api, calls } = fake((call) => (call.path === '/api/v1/folders' ? json(201, folder(FOLDER_ID, 'Mới')) : json(201, doc(DOC_ID, 'Văn bản không tên'))))
    await api.createFolder(null, 'Mới', 'key-folder')
    await api.createBlank('sheet', 'Dự toán', FOLDER_ID, 'key-blank')
    await api.upload(new File([new Uint8Array([0x50, 0x4b, 3, 4])], 'Báo giá.xlsx'), FOLDER_ID, 'key-upload')
    await api.renameDocument(DOC_ID, 'Tên mới')
    expect(calls.map((c) => [c.init.method, c.path, header(c, 'Idempotency-Key')])).toEqual([
      ['POST', '/api/v1/folders', 'key-folder'],
      ['POST', '/api/v1/documents', 'key-blank'],
      ['POST', '/api/v1/documents', 'key-upload'],
      ['PATCH', `/api/v1/documents/${DOC_ID}`, null],
    ])
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ parent_id: null, name: 'Mới' })
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ kind: 'sheet', title: 'Dự toán', folder_id: FOLDER_ID })
    expect(header(calls[1], 'Content-Type')).toBe('application/json')
  })

  it('uploads as multipart with the file and folder, leaving the title to the server', async () => {
    const { api, calls } = fake(() => json(201, doc(DOC_ID, 'Báo giá', 'xlsx', 'sheet')))
    const result = await api.upload(new File([new Uint8Array([1])], 'Báo giá.xlsx'), FOLDER_ID, 'k')
    const form = calls[0].init.body as FormData
    expect(form).toBeInstanceOf(FormData)
    expect((form.get('file') as File).name).toBe('Báo giá.xlsx')
    expect(form.get('folder_id')).toBe(FOLDER_ID)
    expect(form.has('title')).toBe(false)
    // The browser sets the multipart boundary; a hand-written Content-Type would break it.
    expect(header(calls[0], 'Content-Type')).toBeNull()
    expect(result.ok && result.value.format).toBe('xlsx')
  })

  it('renames, moves, trashes and restores folders and documents on their own paths', async () => {
    const { api, calls } = fake((call) => {
      if (call.init.method === 'DELETE') return json(204, null)
      return call.path.includes('/folders/') ? json(200, folder(FOLDER_ID, 'X')) : json(200, doc(DOC_ID, 'Y'))
    })
    expect((await api.renameFolder(FOLDER_ID, 'Tên')).ok).toBe(true)
    await api.moveFolder(FOLDER_ID, null)
    await api.moveDocument(DOC_ID, FOLDER_ID)
    expect(await api.trashFolder(FOLDER_ID)).toEqual({ ok: true, value: true })
    await api.trashDocument(DOC_ID)
    await api.restoreFolder(FOLDER_ID)
    await api.restoreDocument(DOC_ID)
    expect(calls.map((c) => [c.init.method, c.path, c.init.body ?? null])).toEqual([
      ['PATCH', `/api/v1/folders/${FOLDER_ID}`, JSON.stringify({ name: 'Tên' })],
      ['PATCH', `/api/v1/folders/${FOLDER_ID}`, JSON.stringify({ parent_id: null })],
      ['PATCH', `/api/v1/documents/${DOC_ID}`, JSON.stringify({ folder_id: FOLDER_ID })],
      ['DELETE', `/api/v1/folders/${FOLDER_ID}`, null],
      ['DELETE', `/api/v1/documents/${DOC_ID}`, null],
      ['POST', `/api/v1/folders/${FOLDER_ID}/restore`, null],
      ['POST', `/api/v1/documents/${DOC_ID}/restore`, null],
    ])
  })

  it('looks a folder up by id with its ancestors, top level first', async () => {
    const PARENT = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
    const { api, calls } = fake(() => json(200, { folder: folder(FOLDER_ID, 'Phụ lục', PARENT), ancestors: [folder(PARENT, 'Hợp đồng')] }))
    const result = await api.folder(FOLDER_ID)
    expect(calls.map((c) => [c.init.method, c.path, header(c, 'Accept'), header(c, 'Idempotency-Key')])).toEqual([
      ['GET', `/api/v1/folders/${FOLDER_ID}`, 'application/json', null],
    ])
    expect(result.ok && result.value.folder).toMatchObject({ id: FOLDER_ID, name: 'Phụ lục', parentId: PARENT })
    expect(result.ok && result.value.ancestors.map((f) => f.name)).toEqual(['Hợp đồng'])
  })

  it('refuses a folder answer without a readable folder or ancestors list', async () => {
    const lookup = (body: unknown) => fake(() => json(200, body)).api.folder(FOLDER_ID)
    expect(await lookup({ folder: folder(FOLDER_ID, 'X') })).toMatchObject({ ok: false, problem: { kind: 'failed' } })
    expect(await lookup({ folder: { id: FOLDER_ID }, ancestors: [] })).toMatchObject({ ok: false, problem: { kind: 'failed' } })
    expect(await lookup({ folder: folder(FOLDER_ID, 'X'), ancestors: [{ name: 'no id' }] })).toMatchObject({ ok: false, problem: { kind: 'failed' } })
  })

  it('purges with POST …/purge, an Idempotency-Key and no body, and reads the 204', async () => {
    const { api, calls } = fake(() => json(204, null))
    expect(await api.purgeDocument(DOC_ID, 'key-doc')).toEqual({ ok: true, value: true })
    expect(await api.purgeFolder(FOLDER_ID, 'key-folder')).toEqual({ ok: true, value: true })
    expect(calls.map((c) => [c.init.method, c.path, header(c, 'Idempotency-Key'), c.init.body ?? null])).toEqual([
      ['POST', `/api/v1/documents/${DOC_ID}/purge`, 'key-doc', null],
      ['POST', `/api/v1/folders/${FOLDER_ID}/purge`, 'key-folder', null],
    ])
  })

  it('answers a purge or lookup 404 with the one not-found sentence', async () => {
    const { api } = fake(() => error(404, 'NOT_FOUND'))
    expect(await api.purgeDocument(DOC_ID, 'k')).toMatchObject({ ok: false, problem: { kind: 'notFound', message: MESSAGES.notFound } })
    expect(await api.folder(FOLDER_ID)).toMatchObject({ ok: false, problem: { kind: 'notFound', message: MESSAGES.notFound } })
  })

  it('never builds a path outside /api/v1/, even from an odd id', async () => {
    const { api, calls } = fake(() => json(200, doc(DOC_ID, 'Y')))
    await api.renameDocument('../../me', 'x')
    await api.folder('../me')
    await api.purgeFolder('../../me', 'k')
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/documents/..%2F..%2Fme', '/api/v1/folders/..%2Fme', '/api/v1/folders/..%2F..%2Fme/purge'])
  })
})

describe('documents API: errors', () => {
  const problemOf = async (response: Response) => {
    const result = await fake(() => response).api.children(null)
    if (result.ok) throw new Error('expected a problem')
    return result.problem
  }

  it('answers every 404 with the one sentence that reveals nothing', async () => {
    expect(await problemOf(error(404, 'NOT_FOUND'))).toEqual({ kind: 'notFound', message: MESSAGES.notFound, retryable: false, retryAfter: null })
    expect(MESSAGES.notFound).toBe('Không tìm thấy tài liệu hoặc bạn không có quyền mở')
  })

  it('maps 409 NAME_TAKEN, 413 quota and size, and 422 codes', async () => {
    expect((await problemOf(error(409, 'NAME_TAKEN'))).kind).toBe('nameTaken')
    expect((await problemOf(error(413, 'QUOTA_EXCEEDED'))).kind).toBe('quota')
    expect((await problemOf(error(413, 'TOO_LARGE'))).kind).toBe('tooLarge')
    expect((await problemOf(error(422, 'FOLDER_CYCLE'))).kind).toBe('cycle')
    expect((await problemOf(error(422, 'INVALID_SIGNATURE'))).kind).toBe('unsupported')
    expect((await problemOf(error(422, 'INVALID_REQUEST'))).kind).toBe('invalid')
    const mismatch = await problemOf(error(422, 'IDEMPOTENCY_MISMATCH'))
    expect(mismatch.retryable).toBe(true)
  })

  it('marks 429/503 and proxy 5xx retryable, with Retry-After', async () => {
    expect(await problemOf(error(429, 'RATE_LIMITED', true, { 'Retry-After': '7' }))).toMatchObject({ kind: 'busy', retryable: true, retryAfter: 7 })
    expect(await problemOf(error(503, 'UNAVAILABLE', true))).toMatchObject({ kind: 'busy', retryable: true })
    expect(await problemOf(new Response('<html>Bad gateway</html>', { status: 502 }))).toMatchObject({ kind: 'offline', retryable: true })
    expect(await problemOf(error(500, 'INVALID_REQUEST', false))).toMatchObject({ kind: 'failed', retryable: false })
  })

  it('never shows the server text, so wording stays the page own', async () => {
    const problem = await problemOf(error(409, 'NAME_TAKEN'))
    expect(problem.message).not.toContain('Thông báo từ máy chủ')
  })

  it('turns apiFetch rejections into offline and sign-in, and rethrows a refused path', async () => {
    const reject = (code: string) => createDocumentsApi(() => Promise.reject(Object.assign(new Error(code), { code }))).children(null)
    expect(await reject('network')).toMatchObject({ ok: false, problem: { kind: 'offline', retryable: true } })
    expect(await reject('unauthenticated')).toMatchObject({ ok: false, problem: { kind: 'signIn' } })
    expect(await reject('signed_out')).toMatchObject({ ok: false, problem: { kind: 'signIn' } })
    await expect(reject('invalid_api_path')).rejects.toThrow('invalid_api_path')
  })

  it('treats an unreadable success body as a retryable failure, never as data', async () => {
    expect(await problemOf(new Response('not json', { status: 200 }))).toMatchObject({ kind: 'failed', retryable: true })
    expect(await problemOf(json(200, { folders: [{ id: FOLDER_ID }], documents: [], next_cursor: null }))).toMatchObject({ kind: 'failed' })
    expect(await problemOf(json(200, { folders: [], documents: [doc(DOC_ID, 'x', 'doc', 'word')], next_cursor: null }))).toMatchObject({ kind: 'failed' })
  })
})
