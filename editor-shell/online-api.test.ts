import { describe, expect, it } from 'vitest'
import { DOC_ID, FakeOffice, problem } from './fake-office.ts'
import { onlinePage } from './online-harness.ts'

type Outcome = Record<string, unknown> & { kind: string }
interface Api {
  getDocument(id: string): Promise<Outcome>
  getContent(id: string): Promise<Outcome>
  putContent(id: string, bytes: Uint8Array, etag: string): Promise<Outcome>
  createDocument(bytes: Uint8Array, title: string, format: string, folderId: string | null, key: string): Promise<Outcome>
}

function setup() {
  const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', new Uint8Array([1, 2, 3]), 'f0f0f0f0-0000-4000-8000-000000000001')
  const page = onlinePage({ office, scripts: ['online-api.js'] })
  const online = page.window.erpOnline as { createApi(fetch: unknown): Api; messages: Record<string, string> }
  return { office, api: online.createApi(office.apiFetch), messages: online.messages }
}

describe('Office API calls', () => {
  it('reads metadata with its ETag and the bytes with the version they belong to', async () => {
    const { office, api } = setup()
    expect(await api.getDocument(DOC_ID)).toEqual({
      kind: 'ok', etag: office.etag(DOC_ID, 1),
      doc: { id: DOC_ID, title: 'Báo cáo quý', format: 'docx', version: 1, folderId: 'f0f0f0f0-0000-4000-8000-000000000001', role: 'owner', canDownload: true, canShare: true, ownerName: 'Nguyễn Văn An' },
    })
    const content = await api.getContent(DOC_ID)
    expect(content).toMatchObject({ kind: 'ok', etag: office.etag(DOC_ID, 1), version: 1 })
    expect([...(content.bytes as Uint8Array)]).toEqual([1, 2, 3])
    expect(office.calls.map(c => [c.method, c.path])).toEqual([['GET', `/api/v1/documents/${DOC_ID}`], ['GET', `/api/v1/documents/${DOC_ID}/content`]])
  })

  it('reads can_share; a server without it leaves the role to decide', () => {
    const { office } = setup()
    const online = onlinePage({ office, scripts: ['online-api.js'] }).window.erpOnline as { documentOf(body: unknown): Record<string, unknown> | null }
    const body = { id: DOC_ID, title: 'Báo cáo', format: 'docx', version: 1, role: 'editor' }
    expect(online.documentOf({ ...body, can_share: false })).toMatchObject({ canShare: false })
    expect(online.documentOf({ ...body, can_share: true })).toMatchObject({ canShare: true })
    expect(online.documentOf(body)).toMatchObject({ canShare: true })
  })

  it('answers notFound for a missing document without anything that tells why', async () => {
    const { api } = setup()
    expect(await api.getDocument('11111111-1111-4111-8111-111111111111')).toEqual({ kind: 'notFound' })
    expect(await api.getContent('11111111-1111-4111-8111-111111111111')).toEqual({ kind: 'notFound' })
  })

  it('saves with If-Match and octet-stream, and returns the new version and ETag', async () => {
    const { office, api } = setup()
    const saved = await api.putContent(DOC_ID, new Uint8Array([9]), office.etag(DOC_ID, 1))
    expect(saved).toMatchObject({ kind: 'saved', version: 2, etag: office.etag(DOC_ID, 2) })
    const put = office.puts()[0]
    expect(put.headers).toMatchObject({ 'If-Match': office.etag(DOC_ID, 1), 'Content-Type': 'application/octet-stream' })
    expect([...office.latest(DOC_ID)]).toEqual([9])
  })

  it('reads the ETag back from the metadata when a 200 save lacks it', async () => {
    const { office, api } = setup()
    office.on(call => (call.method === 'PUT'
      ? new Response(JSON.stringify({ id: DOC_ID, title: 'Báo cáo quý', format: 'docx', version: 2, folder_id: null }), { status: 200 })
      : undefined))
    office.saveElsewhere(DOC_ID, new Uint8Array([4]))
    expect(await api.putContent(DOC_ID, new Uint8Array([4]), office.etag(DOC_ID, 1))).toMatchObject({ kind: 'saved', version: 2, etag: office.etag(DOC_ID, 2) })
  })

  it.each([
    ['409 VERSION_CONFLICT', () => problem(409, 'VERSION_CONFLICT', { latest_version: 7 }), { kind: 'conflict', latestVersion: 7 }],
    ['409 with another code', () => problem(409, 'NAME_TAKEN'), { kind: 'failed', retryable: false }],
    ['413 TOO_LARGE', () => problem(413, 'TOO_LARGE'), { kind: 'failed', retryable: false, message: 'Lỗi TOO_LARGE' }],
    ['413 QUOTA_EXCEEDED', () => problem(413, 'QUOTA_EXCEEDED'), { kind: 'failed', retryable: false, message: 'Lỗi QUOTA_EXCEEDED' }],
    ['422 INVALID_SIGNATURE', () => problem(422, 'INVALID_SIGNATURE'), { kind: 'failed', retryable: false, message: 'Lỗi INVALID_SIGNATURE' }],
    ['428', () => problem(428, 'PRECONDITION_REQUIRED'), { kind: 'failed', retryable: false }],
    ['429 with Retry-After', () => problem(429, 'RATE_LIMITED', {}, { 'Retry-After': '12' }), { kind: 'failed', retryable: true, retryAfter: 12 }],
    ['503', () => problem(503, 'UNAVAILABLE'), { kind: 'failed', retryable: true, retryAfter: null }],
    ['502 from the proxy', () => new Response('Bad Gateway', { status: 502 }), { kind: 'failed', retryable: true }],
    ['500 saying not retryable', () => problem(500, 'INVALID_REQUEST', { retryable: false }), { kind: 'failed', retryable: false }],
    ['404', () => problem(404, 'NOT_FOUND'), { kind: 'notFound' }],
  ])('maps a save answered %s', async (_name, answer, expected) => {
    const { office, api } = setup()
    office.on(call => (call.method === 'PUT' ? answer() : undefined))
    expect(await api.putContent(DOC_ID, new Uint8Array([9]), office.etag(DOC_ID, 1))).toMatchObject(expected)
  })

  it('uses its own wording when the server message is missing or too long, and never the 428 text', async () => {
    const { office, api, messages } = setup()
    office.on(() => new Response('{}', { status: 413 }))
    expect(await api.putContent(DOC_ID, new Uint8Array([9]), 'e')).toMatchObject({ message: messages.rejected })
    office.on(() => problem(503, 'UNAVAILABLE', { message_vi: 'x'.repeat(301) }))
    expect(await api.putContent(DOC_ID, new Uint8Array([9]), 'e')).toMatchObject({ message: messages.busy })
    office.on(() => problem(428, 'PRECONDITION_REQUIRED'))
    expect(await api.putContent(DOC_ID, new Uint8Array([9]), 'e')).toMatchObject({ message: messages.failed })
  })

  it.each([
    ['network', { kind: 'offline' }],
    ['unauthenticated', { kind: 'signIn' }],
    ['signed_out', { kind: 'signIn' }],
    ['session_expired', { kind: 'signIn' }],
    ['dependency_unavailable', { kind: 'failed', retryable: true }],
  ])('maps an apiFetch rejection %s', async (code, expected) => {
    const { office, api } = setup()
    office.rejections.push(code)
    expect(await api.putContent(DOC_ID, new Uint8Array([9]), 'e')).toMatchObject(expected)
  })

  it('lets a refused URL surface instead of reading it as offline', async () => {
    const { api } = setup()
    await expect(api.getDocument('../../x')).resolves.toEqual({ kind: 'notFound' })
    const page = onlinePage({ scripts: ['online-api.js'] })
    const create = (page.window.erpOnline as { createApi(fetch: unknown): Api }).createApi(() => { throw Object.assign(new Error('invalid_api_path'), { code: 'invalid_api_path' }) })
    await expect(create.getDocument(DOC_ID)).rejects.toMatchObject({ code: 'invalid_api_path' })
  })

  it('creates a document from bytes as multipart, with title, folder and an Idempotency-Key', async () => {
    const { office, api } = setup()
    const created = await api.createDocument(new Uint8Array([5, 6]), 'Báo cáo quý (bản của tôi)', 'docx', 'f0f0f0f0-0000-4000-8000-000000000001', 'key-1')
    expect(created).toMatchObject({ kind: 'ok', doc: { title: 'Báo cáo quý (bản của tôi)', format: 'docx', version: 1 } })
    const post = office.calls.find(c => c.method === 'POST')!
    expect(post.path).toBe('/api/v1/documents')
    expect(post.headers['Idempotency-Key']).toBe('key-1')
    expect(post.headers['Content-Type']).toBeUndefined()
    const form = post.body as FormData
    expect(form.get('title')).toBe('Báo cáo quý (bản của tôi)')
    expect(form.get('folder_id')).toBe('f0f0f0f0-0000-4000-8000-000000000001')
    expect((form.get('file') as File).name).toBe('tai-lieu.docx')
    expect([...office.latest((created.doc as { id: string }).id)]).toEqual([5, 6])
  })
})
