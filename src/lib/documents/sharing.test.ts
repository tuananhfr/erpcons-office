import { describe, expect, it } from 'vitest'
import { isEmail, normalizeEmail, splitEmails } from './emails.ts'
import { linkAction, linkUrl } from './link-copy.ts'
import { inviteResultOf, linkTokenOf, sharedPageOf, sharingOf, versionPageOf } from './parse.ts'
import { parseView, viewHash } from './route.ts'
import { fileName } from './save-file.ts'
import { createSharingApi } from './sharing-api.ts'
import { createVersionsApi } from './versions-api.ts'

const DOC_ID = '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const PERM_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'

interface Call { path: string; init: RequestInit }

function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}
function fake(respond: (call: Call) => Response) {
  const calls: Call[] = []
  const apiFetch = async (path: string, init: RequestInit = {}) => {
    const call = { path, init }
    calls.push(call)
    return respond(call)
  }
  return { sharing: createSharingApi(apiFetch), versions: createVersionsApi(apiFetch), calls }
}
const header = (call: Call, name: string) => new Headers(call.init.headers).get(name)
const body = (call: Call) => JSON.parse(String(call.init.body)) as unknown

const doc = { id: DOC_ID, folder_id: null, title: 'Báo cáo', kind: 'word', format: 'docx', size: 10, version: 4, trashed_at: null, updated_at: '2026-10-29T09:00:00Z', role: 'editor', owner_name: 'An', shared: true, can_download: true, can_share: true }
const person = (actor: string, email: string | null) => ({ actor_id: actor, display_name: 'An', email })
const permission = (id: string, actor: string | null, role = 'viewer') => ({
  id, actor_id: actor, display_name: actor ? 'Bình' : null, email: 'binh@example.com', role, pending: actor === null, created_at: '2026-10-29T09:00:00Z', expires_at: null,
})
const permissions = (link: Record<string, unknown> = { enabled: false, role: null, expires_at: null }, extra: Record<string, unknown> = {}) => ({
  role: 'owner', owner: person('usr_an', 'an@example.com'), permissions: [permission(PERM_ID, 'usr_binh')],
  settings: { editors_can_share: true, viewers_can_download: false }, link, can_share: true, ...extra,
})

describe('emails typed into the share dialog', () => {
  it('accepts what the server accepts and normalizes it the same way', () => {
    expect(isEmail('an@example.com')).toBe(true)
    expect(isEmail('an@example')).toBe(false)
    expect(isEmail('a n@example.com')).toBe(false)
    expect(isEmail('@example.com')).toBe(false)
    expect(isEmail('an@@example.com')).toBe(false)
    expect(normalizeEmail('  An@Example.COM ')).toBe('an@example.com')
  })

  it('splits a pasted list at commas, semicolons, spaces and lines, without repeats', () => {
    expect(splitEmails('An@example.com, binh@example.com;chi@example.com\n<an@example.com> xyz')).toEqual({
      valid: ['an@example.com', 'binh@example.com', 'chi@example.com'], invalid: ['xyz'],
    })
  })
})

describe('the share link', () => {
  it('is copied from the token the server gives people who can share', () => {
    const origin = 'https://office.erpcons.ai'
    expect(linkUrl({ format: 'xlsx' }, TOKEN, origin)).toBe(`${origin}/bang-tinh/#link=${TOKEN}`)
    expect(linkAction({ format: 'docx' }, { enabled: true, expiresAt: null, token: TOKEN }, origin)).toEqual({ kind: 'copy', url: `${origin}/van-ban/#link=${TOKEN}` })
    expect(linkAction({ format: 'docx' }, { enabled: true, expiresAt: null, token: null }, origin)).toEqual({ kind: 'hidden' })
    expect(linkAction({ format: 'docx' }, { enabled: false, expiresAt: null, token: TOKEN }, origin)).toEqual({ kind: 'off' })
  })
})

describe('reading the sharing answers', () => {
  it('keeps the link token only while the link is on, and only a well-formed one', () => {
    expect(sharingOf(permissions({ enabled: true, role: 'viewer', expires_at: null, token: TOKEN }))?.link).toEqual({ enabled: true, expiresAt: null, token: TOKEN })
    expect(sharingOf(permissions({ enabled: false, role: null, expires_at: null, token: TOKEN }))?.link.token).toBeNull()
    expect(sharingOf(permissions({ enabled: true, role: 'viewer', expires_at: null, token: 'short' }))?.link.token).toBeNull()
    expect(sharingOf(permissions({ enabled: true, role: 'viewer', expires_at: null }))?.link.token).toBeNull()
    expect(linkTokenOf({ token: TOKEN, role: 'viewer', expires_at: null })).toBe(TOKEN)
  })

  it('reads people, pending invitations, settings and can_share', () => {
    const sharing = sharingOf(permissions({ enabled: false, role: null, expires_at: null }, { permissions: [permission(PERM_ID, null, 'commenter')] }))!
    expect(sharing.owner).toEqual({ actorId: 'usr_an', displayName: 'An', email: 'an@example.com' })
    expect(sharing.permissions[0]).toMatchObject({ id: PERM_ID, actorId: null, role: 'commenter', pending: true })
    expect(sharing.settings).toEqual({ editorsCanShare: true, viewersCanDownload: false })
    expect(sharing.canShare).toBe(true)
    expect(sharingOf({ ...permissions(), permissions: [permission(PERM_ID, 'usr_binh', 'owner')] })).toBeNull()
  })

  it('reads mail_skipped from an invitation, 0 when absent', () => {
    expect(inviteResultOf({ ...permissions(), mail_skipped: 3 })?.mailSkipped).toBe(3)
    expect(inviteResultOf(permissions())?.mailSkipped).toBe(0)
  })

  it('reads "Được chia sẻ với tôi" with the new mark and the unseen count', () => {
    const page = sharedPageOf({ documents: [{ ...doc, shared_at: '2026-10-29T08:00:00Z', new: true }], unseen: 1, next_cursor: null })!
    expect(page.unseen).toBe(1)
    expect(page.documents[0]).toMatchObject({ id: DOC_ID, role: 'editor', ownerName: 'An', isNew: true, sharedAt: '2026-10-29T08:00:00Z' })
    expect(sharedPageOf({ documents: [], next_cursor: null })).toBeNull()
  })

  it('reads versions newest first as given', () => {
    const page = versionPageOf({ versions: [{ version: 2, size: 5, sha256: 'a'.repeat(64), author_name: 'Bình', created_at: '2026-10-29T09:00:00Z' }], next_cursor: 'c' })
    expect(page).toEqual({ versions: [{ version: 2, size: 5, authorName: 'Bình', createdAt: '2026-10-29T09:00:00Z' }], nextCursor: 'c' })
  })
})

describe('sharing calls', () => {
  it('invites with role, notify and the message only when notifying', async () => {
    const { sharing, calls } = fake(() => json(200, { ...permissions(), mail_skipped: 2 }))
    const result = await sharing.invite(DOC_ID, ['binh@example.com'], 'editor', true, 'Xem giúp')
    expect(result).toMatchObject({ ok: true, value: { mailSkipped: 2 } })
    await sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, 'ignored')
    expect(calls.map(c => [c.init.method, c.path])).toEqual([['POST', `/api/v1/documents/${DOC_ID}/permissions`], ['POST', `/api/v1/documents/${DOC_ID}/permissions`]])
    expect(body(calls[0])).toEqual({ emails: ['binh@example.com'], role: 'editor', notify: true, message: 'Xem giúp' })
    expect(body(calls[1])).toEqual({ emails: ['binh@example.com'], role: 'viewer', notify: false, message: null })
  })

  it('sends an invite again once after a 503, then gives the generic retryable error', async () => {
    let answers = [json(503, { code: 'UNAVAILABLE', message_vi: 'x', request_id: 'r', retryable: true }, { 'Retry-After': '1' }), json(200, { ...permissions(), mail_skipped: 0 })]
    const once = fake(() => answers.shift()!)
    expect(await once.sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, null)).toMatchObject({ ok: true })
    expect(once.calls).toHaveLength(2)
    expect(body(once.calls[1])).toEqual(body(once.calls[0]))

    const unavailable = () => json(503, { code: 'UNAVAILABLE', message_vi: 'x', request_id: 'r', retryable: true })
    answers = [unavailable(), unavailable(), unavailable()]
    const twice = fake(() => answers.shift()!)
    const result = await twice.sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, null)
    expect(twice.calls).toHaveLength(2)
    expect(result).toEqual({ ok: false, problem: { kind: 'failed', message: 'Không thực hiện được thao tác. Hãy thử lại.', retryable: true, retryAfter: null } })

    const limited = fake(() => json(429, { code: 'RATE_LIMITED', message_vi: 'x', request_id: 'r', retryable: true }, { 'Retry-After': '5' }))
    expect(await limited.sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, null)).toMatchObject({
      ok: false, problem: { kind: 'busy', message: 'Máy chủ đang bận. Hãy thử lại sau giây lát.' },
    })
    expect(limited.calls).toHaveLength(1)
    const daily = fake(() => json(429, { code: 'RATE_LIMITED', message_vi: 'x', request_id: 'r', retryable: true }, { 'Retry-After': '3600' }))
    expect(await daily.sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, null)).toMatchObject({
      ok: false, problem: { kind: 'busy', message: 'Bạn đã thêm quá nhiều người mới hôm nay. Hãy thử lại sau.', retryAfter: 3600 },
    })
  })

  it('a document at its 500 people: a message saying so, and the list says how many there are in all', async () => {
    const full = fake(() => json(422, { code: 'TOO_MANY_PERMISSIONS', message_vi: 'x', request_id: 'r', retryable: false }))
    expect(await full.sharing.invite(DOC_ID, ['binh@example.com'], 'viewer', false, null)).toMatchObject({
      ok: false, problem: { kind: 'shareLimit', message: 'Tài liệu đã được chia sẻ với số người tối đa (500).', retryable: false },
    })
    expect(sharingOf(permissions(undefined, { total: 612 }))?.total).toBe(612)
    expect(sharingOf(permissions())?.total).toBe(1)
  })

  it('changes a role or an expiry, removes, saves settings, turns the link on and off', async () => {
    const { sharing, calls } = fake((call) => {
      if (call.init.method === 'DELETE') return json(204, null)
      if (call.path.endsWith('/share-settings')) return json(200, { editors_can_share: false, viewers_can_download: true })
      if (call.path.endsWith('/link')) return json(200, { token: TOKEN, role: 'viewer', expires_at: null })
      return json(200, permission(PERM_ID, 'usr_binh', 'editor'))
    })
    expect(await sharing.changeRole(DOC_ID, PERM_ID, 'editor')).toMatchObject({ ok: true, value: { role: 'editor' } })
    await sharing.changeExpiry(DOC_ID, PERM_ID, null)
    await sharing.remove(DOC_ID, PERM_ID)
    expect(await sharing.saveSettings(DOC_ID, { editorsCanShare: false, viewersCanDownload: true })).toEqual({ ok: true, value: { editorsCanShare: false, viewersCanDownload: true } })
    expect(await sharing.enableLink(DOC_ID)).toEqual({ ok: true, value: TOKEN })
    await sharing.disableLink(DOC_ID)
    const permissionPath = `/api/v1/documents/${DOC_ID}/permissions/${PERM_ID}`
    expect(calls.map(c => [c.init.method, c.path])).toEqual([
      ['PATCH', permissionPath], ['PATCH', permissionPath], ['DELETE', permissionPath],
      ['PUT', `/api/v1/documents/${DOC_ID}/share-settings`], ['PUT', `/api/v1/documents/${DOC_ID}/link`], ['DELETE', `/api/v1/documents/${DOC_ID}/link`],
    ])
    expect(body(calls[0])).toEqual({ role: 'editor' })
    expect(body(calls[1])).toEqual({ expires_at: null })
    expect(body(calls[3])).toEqual({ editors_can_share: false, viewers_can_download: true })
  })

  it('"Gỡ khỏi danh sách của tôi" removes the caller\'s own permission, found by actor id', async () => {
    const { sharing, calls } = fake((call) => (call.init.method === 'DELETE' ? json(204, null) : json(200, permissions())))
    expect(await sharing.leave(DOC_ID, 'usr_binh')).toEqual({ ok: true, value: true })
    expect(calls.map(c => [c.init.method, c.path])).toEqual([['GET', `/api/v1/documents/${DOC_ID}/permissions`], ['DELETE', `/api/v1/documents/${DOC_ID}/permissions/${PERM_ID}`]])
    const other = fake(() => json(200, permissions()))
    expect(await other.sharing.leave(DOC_ID, 'usr_chi')).toMatchObject({ ok: false, problem: { kind: 'notFound' } })
    expect(other.calls).toHaveLength(1)
  })

  it('lists "Được chia sẻ với tôi" by page and marks one seen', async () => {
    const { sharing, calls } = fake((call) => (call.init.method === 'POST' ? json(204, null) : json(200, { documents: [], unseen: 0, next_cursor: null })))
    await sharing.shared('c 2')
    await sharing.markSeen(DOC_ID)
    expect(calls.map(c => [c.init.method, c.path])).toEqual([['GET', '/api/v1/shared?limit=50&cursor=c%202'], ['POST', `/api/v1/shared/${DOC_ID}/seen`]])
  })
})

describe('version calls', () => {
  it('restores naming the current version in If-Match; a 409 is a conflict', async () => {
    let conflict = false
    const { versions, calls } = fake(() => {
      if (conflict) return json(409, { code: 'VERSION_CONFLICT', message_vi: 'x', request_id: 'r', retryable: false, latest_version: 6 })
      return json(200, { ...doc, version: 5 }, { ETag: '"v5"' })
    })
    expect(await versions.restore(DOC_ID, 2, '"v4"')).toMatchObject({ ok: true, value: { etag: '"v5"', doc: { version: 5 } } })
    expect(calls[0]).toMatchObject({ path: `/api/v1/documents/${DOC_ID}/versions/2/restore`, init: { method: 'POST' } })
    expect(header(calls[0], 'If-Match')).toBe('"v4"')
    conflict = true
    expect(await versions.restore(DOC_ID, 2, '"v4"')).toMatchObject({ ok: false, problem: { kind: 'conflict' } })
  })

  it('the owner deletes an old version with DELETE …/versions/{seq}; a refusal comes back as its problem', async () => {
    let refuse = false
    const { versions, calls } = fake(() => refuse ? json(403, { code: 'FORBIDDEN', message_vi: 'x', request_id: 'r', retryable: false }) : json(204, null))
    expect(await versions.remove(DOC_ID, 2)).toEqual({ ok: true, value: true })
    expect(calls[0]).toMatchObject({ path: `/api/v1/documents/${DOC_ID}/versions/2`, init: { method: 'DELETE' } })
    refuse = true
    expect(await versions.remove(DOC_ID, 2)).toMatchObject({ ok: false, problem: { kind: 'forbidden' } })
    const current = fake(() => json(409, { code: 'VERSION_IS_CURRENT', message_vi: 'x', request_id: 'r', retryable: false }))
    expect(await current.versions.remove(DOC_ID, 4)).toMatchObject({ ok: false, problem: { kind: 'currentVersion', message: 'Không thể xoá phiên bản hiện tại.' } })
  })

  it('a 403 reads as forbidden, not as not found', async () => {
    const { versions } = fake(() => json(403, { code: 'FORBIDDEN', message_vi: 'x', request_id: 'r', retryable: false }))
    expect(await versions.versions(DOC_ID)).toMatchObject({ ok: false, problem: { kind: 'forbidden' } })
  })

  it('reads one version\'s bytes from its own path', async () => {
    const { versions, calls } = fake(() => new Response(new Uint8Array([1, 2]), { status: 200 }))
    const result = await versions.bytes(DOC_ID, 3)
    expect(result.ok).toBe(true)
    expect(calls[0].path).toBe(`/api/v1/documents/${DOC_ID}/versions/3/content`)
  })
})

describe('small helpers', () => {
  it('"Được chia sẻ với tôi" is a place in the fragment', () => {
    expect(viewHash({ kind: 'shared' })).toBe('#chia-se')
    expect(parseView('#chia-se', null)).toEqual({ kind: 'shared' })
  })

  it('names a downloaded version after the document, without characters Windows refuses', () => {
    expect(fileName('Báo cáo: quý 3/2026', 'docx', 2)).toBe('Báo cáo_ quý 3_2026 (phiên bản 2).docx')
    expect(fileName('  ', 'pdf')).toBe('Tài liệu.pdf')
  })
})
