import { describe, expect, it, vi } from 'vitest'
import { FakeEvent, type FakeElement } from './fake-dom.ts'
import { DOC_ID, FakeOffice } from './fake-office.ts'
import { fakeWebSocket, type FakeSocket } from './fake-websocket.ts'
import { flush, onlinePage, type PageOptions } from './online-harness.ts'

// The live channel (online-live.js, online-presence.js and their use in online.js / online-link.js) against the
// server protocol of erpcons-office-server docs/openapi.yaml, "Live channel": ticket, socket, hello, presence, mode,
// bye, close codes, reconnects with a fresh ticket, setClientId.
vi.setConfig({ testTimeout: 30 * 1000 })

const bytes = (...values: number[]) => new Uint8Array(values)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
const LIMIT = 'Đã đủ 10 người sửa, bạn đang ở chế độ xem'

type Page = ReturnType<typeof onlinePage>

const member = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: 'user', colour: '#1f6feb', mode: 'edit', state: 'active', ...extra })
const hello = (extra: Record<string, unknown> = {}) => ({
  type: 'hello', v: 1, you: 'm1', mode: 'edit', notice: null, colour: '#1f6feb', seq: 1, leader: 'm1',
  members: [member('m1', { name: 'Nguyễn Văn An' })], limits: { max_message_bytes: 16384, messages_per_second: 10, ping_secs: 20 }, ...extra,
})

async function livePage(options: PageOptions = {}, role = 'owner') {
  const ws = fakeWebSocket()
  const office = options.office ?? new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, role)
  const page = onlinePage({ ...options, office, WebSocket: ws.WebSocket })
  page.fork()
  await page.settle()
  return { page, sockets: ws.sockets }
}
async function tick(page: Page, ms: number) {
  await flush()
  page.clock.advance(ms)
  await page.settle()
}
/** The socket answers the handshake and says hello. */
function join(socket: FakeSocket, extra: Record<string, unknown> = {}) {
  socket.accept()
  socket.receive(hello(extra))
}
const presence = (page: Page) => page.document.querySelector('[data-erp-presence]')
const faces = (page: Page) => page.document.querySelectorAll('[data-erp-presence-member]')
const list = (page: Page) => page.document.querySelector('[data-erp-presence-list]')
const peopleButton = (page: Page) => presence(page)!.querySelector('button')!
const textOf = (nodes: FakeElement[]) => nodes.map(n => n.textContent)
const ticketPosts = (page: Page) => page.office.calls.filter(c => c.method === 'POST' && c.path.endsWith('/live-ticket'))

describe('joining the room', () => {
  it('trades the PI session for a one-time ticket, then opens wss://<origin>/…/live?ticket= with it', async () => {
    const { page, sockets } = await livePage()
    expect(ticketPosts(page)).toHaveLength(1)
    expect(ticketPosts(page)[0].path).toBe(`/api/v1/documents/${DOC_ID}/live-ticket`)
    expect(sockets).toHaveLength(1)
    expect(sockets[0].url).toBe(`wss://office.erpcons.ai/api/v1/documents/${DOC_ID}/live?ticket=${page.office.tickets[0]}`)
  })

  it('no WebSocket in the browser: no ticket, the 30 s check alone', async () => {
    const page = onlinePage()
    page.fork()
    await page.settle()
    expect(ticketPosts(page)).toHaveLength(0)
  })

  it('a version page (&version=) opens no room', async () => {
    const { page, sockets } = await livePage({ search: `?doc=${DOC_ID}&version=1` })
    expect(ticketPosts(page)).toHaveLength(0)
    expect(sockets).toHaveLength(0)
  })

  it('setClientId: 6 lowercase hex chars, given before the first open and again after each hello, the same for the page', async () => {
    const { page, sockets } = await livePage()
    expect(page.clientIds).toHaveLength(1)
    expect(page.clientIds[0]).toMatch(/^[0-9a-f]{6}$/)
    join(sockets[0])
    sockets[0].drop(1006)
    await tick(page, 60 * 1000)
    join(sockets[1])
    expect(page.clientIds).toEqual([page.clientIds[0], page.clientIds[0], page.clientIds[0]])
  })

  it('setClientId is optional: a fork without it opens the document as before', async () => {
    const ws = fakeWebSocket()
    const page = onlinePage({ WebSocket: ws.WebSocket })
    const opened: unknown[] = []
    page.host!.ready({ open: doc => { opened.push(doc) } })
    await page.settle()
    join(ws.sockets[0])
    expect(opened).toHaveLength(1)
  })

  it('a ticket refused with 404 stops the channel and asks the check at once', async () => {
    const ws = fakeWebSocket()
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.on(call => (call.path.endsWith('/live-ticket') ? new Response('{"code":"NOT_FOUND","message_vi":"x","request_id":"r","retryable":false}', { status: 404 }) : undefined))
    const page = onlinePage({ office, WebSocket: ws.WebSocket })
    page.fork()
    await page.settle()
    expect(ws.sockets).toHaveLength(0)
    await tick(page, 10 * 60 * 1000)
    expect(ticketPosts(page)).toHaveLength(1)
  })
})

describe('presence in the bar', () => {
  it('shows the others (never yourself) with initials and the server colour; the list names everyone', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0], {
      members: [
        member('m1', { name: 'Nguyễn Văn An' }),
        member('m2', { name: 'Trần Thị Bình', colour: '#f2c94c', mode: 'view' }),
        member('m3', { kind: 'link', colour: '#7b61ff', mode: 'view', state: 'idle' }),
      ],
    })
    expect(presence(page)!.hidden).toBe(false)
    expect(textOf(faces(page))).toEqual(['B', ''])
    expect(faces(page).map(f => f.title)).toEqual(['Trần Thị Bình · đang xem', 'Người xem qua liên kết · đang xem'])
    expect(faces(page)[0].style.backgroundColor).toBe('#f2c94c')
    // A light colour gets dark text, a dark one white.
    expect(faces(page)[0].style.color).toBe('#101820')
    expect(faces(page)[1].style.color).toBe('#ffffff')
    expect(faces(page)[1].className).toContain('--idle')
    expect(list(page)!.hidden).toBe(true)
    peopleButton(page).click()
    expect(list(page)!.hidden).toBe(false)
    expect(peopleButton(page).getAttribute('aria-expanded')).toBe('true')
    const rows = list(page)!.querySelectorAll('[data-erp-presence-row]')
    expect(rows.map(r => r.getAttribute('data-erp-presence-row'))).toEqual(['you', 'user', 'link'])
    expect(textOf(rows)).toEqual(['ANguyễn Văn An (bạn)Đang sửa', 'BTrần Thị BìnhĐang xem', 'Người xem qua liên kếtĐang xem, tạm vắng'])
    page.document.fire(Object.assign(new FakeEvent('keydown'), { key: 'Escape' }))
    expect(list(page)!.hidden).toBe(true)
  })

  it('alone in the room: nothing in the bar', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    expect(presence(page)!.hidden).toBe(true)
  })

  it('past three faces a "+N"; the narrow bar uses its own count after one face', async () => {
    const { page, sockets } = await livePage()
    const others = ['Bình', 'Chi', 'Dũng', 'Giang', 'Hà'].map((name, at) => member(`m${at + 2}`, { name }))
    join(sockets[0], { members: [member('m1', { name: 'An' }), ...others] })
    expect(faces(page)).toHaveLength(3)
    expect(textOf(presence(page)!.querySelectorAll('.erp-shell__face--more-wide'))).toEqual(['+2'])
    expect(textOf(presence(page)!.querySelectorAll('.erp-shell__face--more-narrow'))).toEqual(['+4'])
    expect(peopleButton(page).getAttribute('aria-label')).toBe('5 người khác đang mở tài liệu. Xem danh sách')
  })

  it('follows presence messages, and clears when the connection drops', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    sockets[0].receive({ type: 'presence', v: 1, seq: 2, members: [member('m1'), member('m4', { name: 'Lê Hoa' })] })
    expect(textOf(faces(page))).toEqual(['H'])
    sockets[0].drop(1006)
    expect(presence(page)!.hidden).toBe(true)
  })

  it('says idle when the page is hidden and active again on return; nothing is sent twice', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    page.document.visibilityState = 'hidden'
    page.document.fire(new FakeEvent('visibilitychange'))
    page.document.fire(new FakeEvent('visibilitychange'))
    page.document.visibilityState = 'visible'
    page.document.fire(new FakeEvent('visibilitychange'))
    page.document.fire(new FakeEvent('keydown'))
    expect(sockets[0].sent).toEqual([{ type: 'presence', v: 1, state: 'idle' }, { type: 'presence', v: 1, state: 'active' }])
  })

  it('idle after five minutes without input', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    await tick(page, 5 * 60 * 1000 + 1000)
    expect(sockets[0].sent).toEqual([{ type: 'presence', v: 1, state: 'idle' }])
  })
})

describe('mode and access from the room', () => {
  it('mode view (the owner made this editor a viewer): flush, then setMode at once, without waiting for the check', async () => {
    const { page, sockets } = await livePage({}, 'editor')
    join(sockets[0])
    const flushes = page.flushes
    page.office.setRole(DOC_ID, 'viewer')
    sockets[0].receive({ type: 'mode', v: 1, seq: 3, mode: 'view', notice: null })
    await page.settle()
    expect(page.flushes).toBeGreaterThan(flushes)
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: true }])
    expect(page.document.querySelector('[data-erp-mode]')!.textContent).toBe('Chỉ xem')
  })

  it('editor_limit: view with a non-blocking notice; the 30 s check does not undo it; a freed slot gives edit back', async () => {
    const { page, sockets } = await livePage({}, 'editor')
    join(sockets[0], { mode: 'view', notice: 'editor_limit' })
    await page.settle()
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: true }])
    expect(page.notices).toContainEqual({ text: LIMIT, role: 'status' })
    expect(page.dialog()).toBeNull()
    expect(page.document.querySelector('[data-erp-mode]')!.title).toBe(LIMIT)
    await tick(page, 30 * 1000)
    expect(page.modes).toHaveLength(1)
    sockets[0].receive({ type: 'mode', v: 1, seq: 4, mode: 'edit', notice: null })
    await page.settle()
    expect(page.modes.at(-1)).toEqual({ docId: DOC_ID, mode: 'edit', canDownload: true })
  })

  it('bye revoked then 4003: the access-lost path at once (not found, read-only), and no reconnect', async () => {
    const { page, sockets } = await livePage({}, 'editor')
    join(sockets[0], { members: [member('m1'), member('m2', { name: 'Chủ' })] })
    page.office.setRole(DOC_ID, null)
    sockets[0].receive({ type: 'bye', v: 1, reason: 'revoked' })
    sockets[0].drop(4003)
    await page.settle()
    expect(page.dialogId()).toBe('gone')
    expect(page.modes).toEqual([{ docId: DOC_ID, mode: 'view', canDownload: true }])
    expect(presence(page)!.hidden).toBe(true)
    await tick(page, 10 * 60 * 1000)
    expect(sockets).toHaveLength(1)
    expect(ticketPosts(page)).toHaveLength(1)
  })

  it('revoked with edits in hand: they go out first, and the refused save offers the copy', async () => {
    const { page, sockets } = await livePage({}, 'editor')
    join(sockets[0])
    page.host!.dirty(DOC_ID, true)
    page.office.setRole(DOC_ID, null)
    sockets[0].drop(4003)
    await page.settle()
    // The fork's flush saves; the 404 then ends read-only with the offer.
    await page.host!.save(DOC_ID, bytes(9), { revision: 1, reason: 'flush' })
    await page.settle()
    expect(page.dialogId()).toBe('access-lost')
  })
})

describe('reconnecting', () => {
  it('a dropped connection comes back with a fresh ticket after a backoff', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    sockets[0].drop(1006)
    await tick(page, 0)
    expect(sockets).toHaveLength(1)
    await tick(page, 2000)
    expect(sockets).toHaveLength(2)
    expect(page.office.tickets).toHaveLength(2)
    expect(page.office.tickets[0]).not.toBe(page.office.tickets[1])
    expect(sockets[1].url).toContain(page.office.tickets[1])
  })

  it('handshakes that keep failing back off up to a minute', async () => {
    const { page, sockets } = await livePage()
    for (let i = 0; i < 8; i++) {
      sockets.at(-1)!.drop(1006)
      await tick(page, 60 * 1000)
    }
    const before = sockets.length
    sockets.at(-1)!.drop(1006)
    await tick(page, 29 * 1000)
    expect(sockets.length).toBe(before)
    await tick(page, 31 * 1000)
    expect(sockets.length).toBe(before + 1)
  })

  it('room full (4029): waits at least 30 s', async () => {
    const { page, sockets } = await livePage()
    sockets[0].accept()
    sockets[0].receive({ type: 'error', v: 1, code: 'ROOM_FULL' })
    sockets[0].drop(4029)
    await tick(page, 29 * 1000)
    expect(sockets).toHaveLength(1)
    await tick(page, 2000)
    expect(sockets).toHaveLength(2)
  })

  it('leaving the page says bye and closes with 1000; a page back from the cache joins again', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    page.fire('pagehide')
    expect(sockets[0].sent).toEqual([{ type: 'bye', v: 1 }])
    expect(sockets[0].closedWith).toBe(1000)
    page.fire('pageshow', Object.assign(new FakeEvent('pageshow'), { persisted: true }))
    await page.settle()
    expect(sockets).toHaveLength(2)
  })

  it('signing out leaves the room', async () => {
    const { page, sockets } = await livePage()
    join(sockets[0])
    page.account.set('signed-out')
    await page.settle()
    expect(sockets[0].closedWith).toBe(1000)
  })

  it('messages of another version or not JSON are ignored', async () => {
    const { page, sockets } = await livePage()
    sockets[0].accept()
    sockets[0].onmessage!({ data: 'not json' })
    sockets[0].receive({ ...hello(), v: 2, members: [member('m1'), member('m2', { name: 'X' })] })
    expect(presence(page)!.hidden).toBe(true)
  })
})

describe('the public link page', () => {
  const linkOptions = () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.links.set(TOKEN, DOC_ID)
    return { office, search: '', hash: `#link=${TOKEN}`, account: { status: 'signed-out' as const, sub: '' } }
  }

  it('asks for the ticket with X-Link-Token only, and shows the others without names', async () => {
    const { page, sockets } = await livePage(linkOptions())
    const ask = page.office.linkCalls.find(c => c.path.endsWith('/live-ticket'))!
    expect(ask.init.method).toBe('POST')
    expect(new Headers(ask.init.headers).get('X-Link-Token')).toBe(TOKEN)
    expect(new Headers(ask.init.headers).has('Authorization')).toBe(false)
    expect(sockets[0].url).not.toContain(TOKEN)
    join(sockets[0], { you: 'm2', mode: 'view', members: [member('m1'), member('m2', { kind: 'link', mode: 'view' })] })
    expect(page.clientIds).toHaveLength(2)
    expect(faces(page).map(f => f.title)).toEqual(['Người dùng · đang sửa'])
  })

  it('the link turned off (revoked): the link-gone notice', async () => {
    const { page, sockets } = await livePage(linkOptions())
    join(sockets[0], { you: 'm2', mode: 'view' })
    sockets[0].drop(4003)
    await page.settle()
    expect(page.dialogId()).toBe('gone')
  })
})

it('never logs tickets, tokens, names or document ids', async () => {
  const { page, sockets } = await livePage()
  join(sockets[0], { members: [member('m1'), member('m2', { name: 'Trần Thị Bình' })] })
  sockets[0].drop(4013)
  await tick(page, 60 * 1000)
  const logged = JSON.stringify(page.logs)
  for (const secret of [...page.office.tickets, DOC_ID, 'Trần Thị Bình']) expect(logged).not.toContain(secret)
})
