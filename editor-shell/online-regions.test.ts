import { describe, expect, it, vi } from 'vitest'
import { DOC_ID, FakeOffice, problem } from './fake-office.ts'
import { fakeWebSocket, type FakeSocket } from './fake-websocket.ts'
import { flush, onlinePage, type HostDoc, type PageOptions, type SaveResult } from './online-harness.ts'

// Region co-editing (online-regions.js, online-leader.js and their wiring in online.js / online-link.js) against the
// M4 protocol of erpcons-office-server docs/openapi.yaml ("Co-editing (M4)") and erpHost v3 (docs/erp-host.md),
// with a fake server socket and a fake v3 editor.
vi.setConfig({ testTimeout: 30 * 1000 })

const bytes = (...values: number[]) => new Uint8Array(values)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'
type Page = ReturnType<typeof onlinePage>
type Msg = Record<string, unknown>

interface V3Host {
  save(docId: string, bytes: Uint8Array, options: { revision: number; reason: string }): Promise<SaveResult>
  dirty(docId: string, dirty: boolean): void
  opened(docId: string, ok: boolean): void
  regionWillEdit(region: string): Promise<boolean>
  regionChanged(region: string, payload: string): void
  regionDidEndEdit(region: string): void
  selectionChanged(region: string, range: string): void
  ready(handlers: Record<string, unknown>): void
  version: number
}

const member = (id: string, extra: Msg = {}) => ({ id, kind: 'user', colour: '#1f6feb', mode: 'edit', state: 'active', person: `p-${id}`, ...extra })
const ROOM = [member('m1', { name: 'Nguyễn Văn An' }), member('m2', { name: 'Trần Thị Bình', colour: '#f2c94c' })]
const hello = (extra: Msg = {}) => ({
  type: 'hello', v: 1, you: 'm1', mode: 'edit', notice: null, colour: '#1f6feb', seq: 10, saved_seq: 10, saved_version: null, leader: 'm2',
  members: ROOM, limits: { max_message_bytes: 16384, max_region_message_bytes: 1048576, messages_per_second: 10, ping_secs: 20, max_editors: 10, max_connections: 50 },
  ...extra,
})
const update = (seq: number, region: string, payload: string, author = 'm2') => ({ type: 'region.update', v: 1, seq, region, author, payload })

interface ForkOptions {
  /** regionConflict's answer; absent: the editor has no regionConflict (the shell asks). */
  conflict?: (region: string) => string | Promise<string>
  /** An editor without erpHost v3 (no applyRemote). */
  legacy?: boolean
}

function v3Fork(page: Page, options: ForkOptions = {}) {
  const log = {
    opened: [] as HostDoc[], applied: [] as [string, string, string][], presence: [] as Msg[][], locks: [] as Msg[][],
    cursors: [] as Msg[][], denied: [] as string[], leader: [] as boolean[], acks: [] as { revision: number; version: number }[],
    asked: [] as string[], flushes: 0,
  }
  const host = page.host as unknown as V3Host
  const handlers: Record<string, unknown> = {
    open: (doc: HostDoc) => {
      log.opened.push(doc)
      host.opened(doc.docId, true)
    },
    flush: async () => { log.flushes += 1 },
    acknowledged: (_id: string, revision: number, version: number) => { log.acks.push({ revision, version }) },
    setMode: () => {}, setUser: () => {}, setClientId: () => {},
  }
  if (!options.legacy) {
    Object.assign(handlers, {
      applyRemote: (region: string, payload: string, author: string) => { log.applied.push([region, payload, author]) },
      showPresence: (members: Msg[]) => { log.presence.push(members) },
      showLocks: (locks: Msg[]) => { log.locks.push(locks) },
      showCursors: (cursors: Msg[]) => { log.cursors.push(cursors) },
      lockDenied: (region: string) => { log.denied.push(region) },
      isLeader: (leader: boolean) => { log.leader.push(leader) },
    })
  }
  if (options.conflict) {
    const answer = options.conflict
    handlers.regionConflict = (region: string) => { log.asked.push(region); return answer(region) }
  }
  host.ready(handlers)
  return { log, host }
}

async function coPage(options: PageOptions & ForkOptions = {}, role = 'owner') {
  const ws = fakeWebSocket()
  const office = options.office ?? new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3), null, role)
  const page = onlinePage({ ...options, office, WebSocket: ws.WebSocket })
  const fork = v3Fork(page, options)
  await page.settle()
  return { page, sockets: ws.sockets, ...fork }
}
async function tick(page: Page, ms: number) {
  await flush()
  page.clock.advance(ms)
  await page.settle()
}
const sent = (socket: FakeSocket, type?: string) => socket.sent.filter(m => type === undefined || m.type === type)
/** The socket answers the handshake, says hello and ends the replay the page asks for. */
async function sync(page: Page, socket: FakeSocket, extra: Msg = {}, replayed: Msg[] = []) {
  socket.accept()
  socket.receive(hello(extra))
  const replay = sent(socket, 'region.replay').at(-1)
  for (const msg of replayed) socket.receive(msg)
  socket.receive({ type: 'region.replayed', v: 1, since: replay?.since ?? 0, seq: Math.max(10, ...replayed.map(m => Number(m.seq))) })
  await page.settle()
}
async function grantNext(page: Page, socket: FakeSocket) {
  const ask = sent(socket, 'lock.acquire').at(-1)!
  socket.receive({ type: 'lock.granted', v: 1, region: ask.region, cid: ask.cid, holder: 'm1', expires_ms: 5000 })
  await page.settle()
  return ask
}
const puts = (page: Page) => page.office.puts()

describe('joining and replay', () => {
  it('replays from the room\'s saved_seq once the editor opened the content, then applies each update once in seq order', async () => {
    const { sockets, log } = await coPage()
    const socket = sockets[0]
    socket.accept()
    socket.receive(hello())
    expect(sent(socket, 'region.replay')).toEqual([{ type: 'region.replay', v: 1, since: 10 }])
    // Replayed out of order and a live one queued before the replay: applied by seq, duplicates dropped.
    socket.receive(update(14, 'para:b', 'B2'))
    socket.receive(update(12, 'para:a', 'A1'))
    socket.receive(update(14, 'para:b', 'B2'))
    socket.receive({ type: 'region.replayed', v: 1, since: 10, seq: 15 })
    socket.receive(update(13, 'para:c', 'late'))
    socket.receive(update(16, 'para:a', 'A2'))
    socket.receive(update(16, 'para:a', 'A2'))
    expect(log.applied).toEqual([['para:a', 'A1', 'm2'], ['para:b', 'B2', 'm2'], ['para:a', 'A2', 'm2']])
  })

  it('newer stored content than the editor shows: reloads it (preserving the view) before replaying', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const { page, sockets, log } = await coPage({ office })
    office.saveElsewhere(DOC_ID, bytes(4, 5, 6))
    sockets[0].accept()
    sockets[0].receive(hello({ saved_version: 2, saved_seq: 30 }))
    await page.settle()
    expect(log.opened.at(-1)).toMatchObject({ version: 2, preserveView: true })
    expect(sent(sockets[0], 'region.replay')).toEqual([{ type: 'region.replay', v: 1, since: 30 }])
  })

  it('a reconnect replays since the last applied seq and resends the unacknowledged edit with its cid', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0], {}, [update(12, 'para:a', 'A1')])
    expect(await (async () => { const p = host.regionWillEdit('para:b'); await grantNext(page, sockets[0]); return p })()).toBe(true)
    host.regionChanged('para:b', 'mine')
    await tick(page, 150)
    const first = sent(sockets[0], 'region.update')[0]
    sockets[0].drop(1006)
    await tick(page, 5 * 1000)
    const socket = sockets[1]
    socket.accept()
    socket.receive(hello({ you: 'm3', members: [member('m3', { name: 'Nguyễn Văn An' }), ROOM[1]] }))
    expect(sent(socket, 'region.replay')).toEqual([{ type: 'region.replay', v: 1, since: 12 }])
    // Its own update came back in the replay under its old member id: neither applied nor asked about.
    socket.receive(update(13, 'para:b', 'mine', 'm1'))
    socket.receive({ type: 'region.replayed', v: 1, since: 12, seq: 13 })
    await page.settle()
    await grantNext(page, socket)
    expect(sent(socket, 'region.update')).toEqual([{ type: 'region.update', v: 1, region: 'para:b', cid: first.cid, payload: 'mine' }])
    expect(page.dialogId()).toBeNull()
  })

  it('REPLAY_GONE: reloads the latest content with preserveView, then replays from the saved_seq it named', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const { page, sockets, log } = await coPage({ office })
    await sync(page, sockets[0])
    sockets[0].drop(1006)
    await tick(page, 5 * 1000)
    office.saveElsewhere(DOC_ID, bytes(7, 7))
    const socket = sockets[1]
    socket.accept()
    socket.receive(hello())
    expect(sent(socket, 'region.replay').at(-1)).toEqual({ type: 'region.replay', v: 1, since: 10 })
    socket.receive({ type: 'error', v: 1, code: 'REPLAY_GONE', saved_seq: 40, saved_version: 2 })
    await page.settle()
    expect(log.opened.at(-1)).toMatchObject({ version: 2, preserveView: true })
    expect(sent(socket, 'region.replay').at(-1)).toEqual({ type: 'region.replay', v: 1, since: 40 })
  })

  it('REPLAY_GONE with an edit not acknowledged: never resends its old cid, asks, then sends it as a new update', async () => {
    const { page, sockets, host, log } = await coPage({ conflict: () => 'mine' })
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'mine')
    await tick(page, 150)
    const old = sent(sockets[0], 'region.update')[0]
    sockets[0].drop(1006)
    await tick(page, 5 * 1000)
    const socket = sockets[1]
    socket.accept()
    socket.receive(hello())
    socket.receive({ type: 'error', v: 1, code: 'REPLAY_GONE', saved_seq: 40, saved_version: null })
    await page.settle()
    socket.receive({ type: 'region.replayed', v: 1, since: 40, seq: 41 })
    await page.settle()
    await grantNext(page, socket)
    expect(log.asked).toEqual(['para:a'])
    const resent = sent(socket, 'region.update')
    expect(resent).toMatchObject([{ region: 'para:a', payload: 'mine' }])
    expect(resent[0].cid).not.toBe(old.cid)
  })
})

describe('locks', () => {
  it('regionWillEdit asks lock.acquire with a cid and resolves true on lock.granted, false on lock.denied', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('shape:s1:a')
    const ask = sent(sockets[0], 'lock.acquire')[0]
    expect(ask).toMatchObject({ type: 'lock.acquire', v: 1, region: 'shape:s1:a' })
    expect(typeof ask.cid).toBe('string')
    sockets[0].receive({ type: 'lock.granted', v: 1, region: 'shape:s1:a', cid: ask.cid, holder: 'm1', expires_ms: 5000 })
    expect(await granted).toBe(true)
    const denied = host.regionWillEdit('shape:s1:b')
    const ask2 = sent(sockets[0], 'lock.acquire')[1]
    expect(ask2.cid).not.toBe(ask.cid)
    sockets[0].receive({ type: 'lock.denied', v: 1, region: 'shape:s1:b', cid: ask2.cid, holder: 'm2', expires_ms: 3200 })
    expect(await denied).toBe(false)
  })

  it('renews every 2 s while editing and releases after regionDidEndEdit', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('cell:s1:A1')
    await grantNext(page, sockets[0])
    expect(await granted).toBe(true)
    await tick(page, 1999)
    expect(sent(sockets[0], 'lock.renew')).toHaveLength(0)
    await tick(page, 1)
    expect(sent(sockets[0], 'lock.renew')).toEqual([{ type: 'lock.renew', v: 1, region: 'cell:s1:A1' }])
    await tick(page, 4000)
    expect(sent(sockets[0], 'lock.renew')).toHaveLength(3)
    host.regionDidEndEdit('cell:s1:A1')
    expect(sent(sockets[0], 'lock.release')).toEqual([{ type: 'lock.release', v: 1, region: 'cell:s1:A1' }])
    await tick(page, 10 * 1000)
    expect(sent(sockets[0], 'lock.renew')).toHaveLength(3)
  })

  it('a refused renewal (lock.denied, cid null) tells the editor lockDenied', async () => {
    const { page, sockets, host, log } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    sockets[0].receive({ type: 'lock.denied', v: 1, region: 'para:a', cid: null, holder: 'm2', expires_ms: 4000 })
    expect(log.denied).toEqual(['para:a'])
  })

  it('after a reconnect the region being edited is locked again, or the editor hears it lost it', async () => {
    const { page, sockets, host, log } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    sockets[0].drop(1006)
    await tick(page, 5 * 1000)
    await sync(page, sockets[1])
    const ask = sent(sockets[1], 'lock.acquire')[0]
    expect(ask).toMatchObject({ region: 'para:a' })
    sockets[1].receive({ type: 'lock.denied', v: 1, region: 'para:a', cid: ask.cid, holder: 'm2', expires_ms: 5000 })
    await page.settle()
    expect(log.denied).toEqual(['para:a'])
  })

  it('the lock table reaches showLocks with each holder\'s name and colour, own locks marked', async () => {
    const { page, sockets, log } = await coPage()
    await sync(page, sockets[0])
    sockets[0].receive({ type: 'locks', v: 1, seq: 11, locks: { 'para:a': { holder: 'm2', colour: '#f2c94c' }, 'para:b': { holder: 'm1', colour: '#1f6feb' } } })
    expect(log.locks.at(-1)).toEqual([
      { region: 'para:a', holder: 'm2', name: 'Trần Thị Bình', colour: '#f2c94c', mine: false },
      { region: 'para:b', holder: 'm1', name: 'Nguyễn Văn An', colour: '#1f6feb', mine: true },
    ])
    sockets[0].drop(1006)
    expect(log.locks.at(-1)).toEqual([])
  })

  it('a viewer gets false from regionWillEdit and sends nothing', async () => {
    const { page, sockets, host } = await coPage({}, 'viewer')
    await sync(page, sockets[0], { mode: 'view' })
    expect(await host.regionWillEdit('para:a')).toBe(false)
    host.regionChanged('para:a', 'x')
    await tick(page, 1000)
    expect(sent(sockets[0], 'lock.acquire')).toHaveLength(0)
    expect(sent(sockets[0], 'region.update')).toHaveLength(0)
  })
})

describe('updates', () => {
  it('regionChanged is coalesced for 150 ms into one region.update with the newest payload and a cid', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'v1')
    host.regionChanged('para:a', 'v2')
    await tick(page, 100)
    host.regionChanged('para:a', 'v3')
    expect(sent(sockets[0], 'region.update')).toHaveLength(0)
    await tick(page, 50)
    const updates = sent(sockets[0], 'region.update')
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({ region: 'para:a', payload: 'v3' })
    expect(typeof updates[0].cid).toBe('string')
  })

  it('an edit in a region it does not hold yet is locked first, sent, then the lock is let go', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    host.regionChanged('cell:s1:B2', '42')
    await tick(page, 150)
    expect(sent(sockets[0], 'region.update')).toHaveLength(0)
    await grantNext(page, sockets[0])
    expect(sent(sockets[0], 'region.update')).toHaveLength(1)
    expect(sent(sockets[0], 'lock.release')).toEqual([{ type: 'lock.release', v: 1, region: 'cell:s1:B2' }])
  })

  it('LOCK_REQUIRED: locks again and resends the same cid', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'x')
    await tick(page, 150)
    const first = sent(sockets[0], 'region.update')[0]
    sockets[0].receive({ type: 'error', v: 1, code: 'LOCK_REQUIRED', cid: first.cid })
    await page.settle()
    await grantNext(page, sockets[0])
    expect(sent(sockets[0], 'region.update').map(m => m.cid)).toEqual([first.cid, first.cid])
  })

  it('SERVER_BUSY on an update keeps it queued and sends it again later, same cid', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'x')
    await tick(page, 150)
    const first = sent(sockets[0], 'region.update')[0]
    sockets[0].receive({ type: 'error', v: 1, code: 'SERVER_BUSY', cid: first.cid })
    await page.settle()
    expect(sockets[0].readyState).toBe(1)
    await tick(page, 1000)
    expect(sent(sockets[0], 'region.update')).toHaveLength(1)
    await tick(page, 1000)
    expect(sent(sockets[0], 'region.update').map(m => m.cid)).toEqual([first.cid, first.cid])
    expect(page.dialogId()).toBeNull()
  })

  it('an own ack counts as applied: a lower remote seq is dropped', async () => {
    const { page, sockets, host, log } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'x')
    await tick(page, 150)
    const cid = sent(sockets[0], 'region.update')[0].cid
    sockets[0].receive({ type: 'ack', v: 1, cid, seq: 20 })
    sockets[0].receive(update(19, 'para:z', 'old'))
    sockets[0].receive(update(21, 'para:z', 'new'))
    expect(log.applied).toEqual([['para:z', 'new', 'm2']])
  })

  it('a link viewer applies the room\'s updates and replays from saved_seq', async () => {
    const ws = fakeWebSocket()
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.links.set(TOKEN, DOC_ID)
    const page = onlinePage({ office, search: '', hash: `#link=${TOKEN}`, WebSocket: ws.WebSocket })
    const { log, host } = v3Fork(page)
    await page.settle()
    await sync(page, ws.sockets[0], { mode: 'view', members: [member('m1', { kind: 'link', mode: 'view' }), ROOM[1]] }, [update(11, 'annot:n1', 'a')])
    ws.sockets[0].receive(update(12, 'annot:n2', 'b'))
    expect(log.applied).toEqual([['annot:n1', 'a', 'm2'], ['annot:n2', 'b', 'm2']])
    expect(await host.regionWillEdit('annot:n1')).toBe(false)
  })
})

describe('cursors and presence', () => {
  it('selectionChanged goes out at most every 100 ms (the newest last); others\' cursors reach showCursors', async () => {
    const { page, sockets, host, log } = await coPage()
    await sync(page, sockets[0])
    for (let i = 1; i <= 5; i++) host.selectionChanged('para:a', `0-${i}`)
    expect(sent(sockets[0], 'cursor')).toEqual([{ type: 'cursor', v: 1, region: 'para:a', range: '0-1' }])
    await tick(page, 100)
    expect(sent(sockets[0], 'cursor').map(m => m.range)).toEqual(['0-1', '0-5'])
    await tick(page, 300)
    expect(sent(sockets[0], 'cursor')).toHaveLength(2)
    sockets[0].receive({ type: 'cursor', v: 1, author: 'm2', region: 'para:b', range: '3-4' })
    expect(log.cursors.at(-1)).toEqual([{ author: 'm2', name: 'Trần Thị Bình', colour: '#f2c94c', region: 'para:b', range: '3-4' }])
    sockets[0].receive({ type: 'presence', v: 1, seq: 12, members: [ROOM[0]] })
    expect(log.cursors.at(-1)).toEqual([])
  })

  it('showPresence gets every member with its person key and which one is this page', async () => {
    const { page, sockets, log } = await coPage()
    await sync(page, sockets[0])
    expect(log.presence.at(-1)).toEqual([
      { id: 'm1', kind: 'user', name: 'Nguyễn Văn An', colour: '#1f6feb', mode: 'edit', state: 'active', person: 'p-m1', you: true },
      { id: 'm2', kind: 'user', name: 'Trần Thị Bình', colour: '#f2c94c', mode: 'edit', state: 'active', person: 'p-m2', you: false },
    ])
  })

  it('the bar shows one face per person: two tabs of Bình are one, your own other tab is you', async () => {
    const { page, sockets } = await coPage()
    await sync(page, sockets[0], {
      members: [
        member('m1', { name: 'Nguyễn Văn An', person: 'pa' }), member('m4', { name: 'Nguyễn Văn An', person: 'pa', mode: 'view' }),
        member('m2', { name: 'Trần Thị Bình', person: 'pb', mode: 'view', state: 'idle' }), member('m3', { name: 'Trần Thị Bình', person: 'pb' }),
      ],
    })
    const faces = page.document.querySelectorAll('[data-erp-presence-member]')
    expect(faces.map(f => f.textContent)).toEqual(['B'])
    expect(faces[0].getAttribute('data-erp-presence-member')).toBe('edit')
    page.document.querySelector('[data-erp-presence]')!.querySelector('button')!.click()
    const rows = page.document.querySelectorAll('[data-erp-presence-row]')
    expect(rows.map(r => r.getAttribute('data-erp-presence-row'))).toEqual(['you', 'user'])
    expect(rows[1].textContent).toContain('2 thẻ')
  })

  it('isLeader follows the room\'s leader', async () => {
    const { page, sockets, log } = await coPage()
    await sync(page, sockets[0])
    expect(log.leader).toEqual([false])
    sockets[0].receive({ type: 'leader', v: 1, seq: 11, leader: 'm1' })
    sockets[0].receive({ type: 'leader', v: 1, seq: 12, leader: 'm1' })
    expect(log.leader).toEqual([false, true])
  })

  it('the editor limit notice names the room\'s max_editors', async () => {
    const { page, sockets } = await coPage()
    sockets[0].accept()
    sockets[0].receive(hello({ mode: 'view', notice: 'editor_limit', limits: { max_message_bytes: 16384, max_region_message_bytes: 16384, messages_per_second: 10, ping_secs: 20, max_editors: 12 } }))
    await page.settle()
    expect(page.notices.map(n => n.text)).toContain('Đã đủ 12 người sửa, bạn đang ở chế độ xem')
  })
})

describe('saving in the room', () => {
  async function leaderPage(extra: Msg = {}) {
    const result = await coPage()
    await sync(result.page, result.sockets[0], { leader: 'm1', ...extra })
    return result
  }
  async function edit(page: Page, socket: FakeSocket, host: V3Host, region: string, payload: string, seq: number) {
    const granted = host.regionWillEdit(region)
    await grantNext(page, socket)
    await granted
    host.regionChanged(region, payload)
    await tick(page, 150)
    const cid = sent(socket, 'region.update').at(-1)!.cid
    socket.receive({ type: 'ack', v: 1, cid, seq })
    host.regionDidEndEdit(region)
    await page.settle()
  }

  it('a non-leader never PUTs: its save is answered once the room acknowledged its edits', async () => {
    const { page, sockets, host, log } = await coPage()
    await sync(page, sockets[0])
    const granted = host.regionWillEdit('para:a')
    await grantNext(page, sockets[0])
    await granted
    host.regionChanged('para:a', 'x')
    host.dirty(DOC_ID, true)
    const early = await host.save(DOC_ID, bytes(9), { revision: 1, reason: 'auto' })
    expect(early).toEqual({ status: 'offline' })
    await tick(page, 150)
    sockets[0].receive({ type: 'ack', v: 1, cid: sent(sockets[0], 'region.update')[0].cid, seq: 11 })
    await page.settle()
    expect(log.acks).toEqual([{ revision: 1, version: 1 }])
    expect(await host.save(DOC_ID, bytes(9, 9), { revision: 2, reason: 'auto' })).toEqual({ status: 'saved', version: 1 })
    await tick(page, 5 * 60 * 1000)
    expect(puts(page)).toHaveLength(0)
    // The room holds every edit: "Đã lưu", and closing the tab does not ask.
    expect(page.badge()!.getAttribute('data-erp-save-state')).toBe('SERVER_DURABLE')
    expect(page.fire('beforeunload').defaultPrevented).toBe(false)
  })

  it('the leader saves 30 s after the last change in the room, with X-Live-Seq of what its bytes hold', async () => {
    const { page, sockets, host } = await leaderPage()
    await edit(page, sockets[0], host, 'para:a', 'x', 11)
    expect(await host.save(DOC_ID, bytes(5, 5), { revision: 1, reason: 'auto' })).toEqual({ status: 'saved', version: 1 })
    await tick(page, 20 * 1000)
    // Someone else's change restarts the 30 s.
    sockets[0].receive(update(12, 'para:b', 'y'))
    await host.save(DOC_ID, bytes(6, 6), { revision: 2, reason: 'auto' })
    await tick(page, 29 * 1000)
    expect(puts(page)).toHaveLength(0)
    await tick(page, 1000)
    expect(puts(page)).toHaveLength(1)
    expect(puts(page)[0].headers['X-Live-Seq']).toBe('12')
    expect(Array.from(page.office.latest(DOC_ID))).toEqual([6, 6])
    await tick(page, 5 * 60 * 1000)
    expect(puts(page)).toHaveLength(1)
  })

  it('edits that never pause for 30 s still reach storage within 2 minutes', async () => {
    const { page, sockets, host } = await leaderPage()
    for (let i = 0; i < 12; i++) {
      sockets[0].receive(update(11 + i, 'para:b', `y${i}`))
      await host.save(DOC_ID, bytes(i), { revision: i + 1, reason: 'auto' })
      await tick(page, 10 * 1000)
    }
    expect(puts(page)).toHaveLength(1)
  })

  it('save.request makes the leader save now', async () => {
    const { page, sockets, host } = await leaderPage()
    sockets[0].receive(update(11, 'para:b', 'y'))
    await host.save(DOC_ID, bytes(3), { revision: 1, reason: 'auto' })
    sockets[0].receive({ type: 'save.request', v: 1 })
    await page.settle()
    expect(puts(page)).toHaveLength(1)
    expect(puts(page)[0].headers['X-Live-Seq']).toBe('11')
  })

  it('the leader left as the last editor saves at once, and on pagehide', async () => {
    const { page, sockets, host } = await leaderPage()
    sockets[0].receive(update(11, 'para:b', 'y'))
    await host.save(DOC_ID, bytes(3), { revision: 1, reason: 'auto' })
    sockets[0].receive({ type: 'presence', v: 1, seq: 12, members: [ROOM[0]] })
    await page.settle()
    expect(puts(page)).toHaveLength(1)
    sockets[0].receive(update(13, 'para:c', 'z'))
    await host.save(DOC_ID, bytes(4), { revision: 2, reason: 'auto' })
    page.fire('pagehide')
    await page.settle()
    expect(puts(page)).toHaveLength(2)
    expect(puts(page)[1].headers['X-Live-Seq']).toBe('13')
  })

  it('a version another leader saved is the base of the next save (no false conflict)', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const { page, sockets, host } = await coPage({ office })
    await sync(page, sockets[0])
    sockets[0].receive(update(11, 'para:b', 'y'))
    await host.save(DOC_ID, bytes(8), { revision: 1, reason: 'auto' })
    // m2 stored version 2 for the room, then left: this page leads now.
    office.saveElsewhere(DOC_ID, bytes(8))
    sockets[0].receive({ type: 'saved', v: 1, saved_seq: 11, version: 2 })
    sockets[0].receive(update(12, 'para:c', 'z'))
    await host.save(DOC_ID, bytes(8, 1), { revision: 2, reason: 'auto' })
    sockets[0].receive({ type: 'leader', v: 1, seq: 13, leader: 'm1' })
    await tick(page, 30 * 1000)
    expect(puts(page)).toHaveLength(1)
    expect(puts(page)[0].headers['If-Match']).toBe(office.etag(DOC_ID, 2))
    expect(office.version(DOC_ID)).toBe(3)
    expect(page.dialogId()).toBeNull()
  })

  it('NOT_LEADER on the leader\'s save (leadership just moved) is no error', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.on(call => (call.method === 'PUT' ? problem(409, 'NOT_LEADER', { message_vi: 'x', request_id: 'r', retryable: false }) : undefined))
    const { page, sockets, host } = await coPage({ office })
    await sync(page, sockets[0], { leader: 'm1' })
    sockets[0].receive({ type: 'save.request', v: 1 })
    sockets[0].receive(update(11, 'para:b', 'y'))
    await host.save(DOC_ID, bytes(3), { revision: 1, reason: 'manual' })
    await page.settle()
    expect(puts(page)).toHaveLength(1)
    expect(page.badge()!.getAttribute('data-erp-save-state')).not.toBe('ERROR')
  })

  it('an editor without v3, not the leader, with several editors: holds its bytes instead of a PUT, saves once it leads', async () => {
    const { page, sockets, host } = await coPage({ legacy: true })
    sockets[0].accept()
    sockets[0].receive(hello())
    await page.settle()
    expect(sent(sockets[0], 'region.replay')).toHaveLength(0)
    expect(await host.save(DOC_ID, bytes(4, 4), { revision: 1, reason: 'auto' })).toEqual({ status: 'offline' })
    await page.settle()
    expect(puts(page)).toHaveLength(0)
    expect(page.badge()!.getAttribute('data-erp-save-state')).toBe('LOCAL_ONLY')
    sockets[0].receive({ type: 'leader', v: 1, seq: 11, leader: 'm1' })
    await page.settle()
    expect(puts(page)).toHaveLength(1)
    expect(puts(page)[0].headers['X-Live-Seq']).toBeUndefined()
  })

  it('an editor without v3 alone in the room saves as before', async () => {
    const { page, sockets, host } = await coPage({ legacy: true })
    sockets[0].accept()
    sockets[0].receive(hello({ leader: 'm1', members: [ROOM[0]] }))
    await page.settle()
    expect(await host.save(DOC_ID, bytes(4, 4), { revision: 1, reason: 'auto' })).toEqual({ status: 'saved', version: 2 })
  })
})

describe('offline edits and their conflict', () => {
  async function offlineEdit(options: ForkOptions = {}) {
    const result = await coPage(options)
    const { page, sockets, host } = result
    await sync(page, sockets[0])
    sockets[0].drop(1006)
    await page.settle()
    // Offline the edit goes ahead at once.
    expect(await host.regionWillEdit('cell:s1:A1')).toBe(true)
    host.regionChanged('cell:s1:A1', 'mine')
    host.regionDidEndEdit('cell:s1:A1')
    expect(await host.save(DOC_ID, bytes(1, 1), { revision: 1, reason: 'auto' })).toEqual({ status: 'offline' })
    await tick(page, 5 * 1000)
    const socket = sockets[1]
    await sync(page, socket, { you: 'm5' }, [update(12, 'cell:s1:A1', 'theirs')])
    return { ...result, socket }
  }

  it('kept on the device while offline, with the offline state shown', async () => {
    const { page, sockets, host } = await coPage()
    await sync(page, sockets[0])
    sockets[0].drop(1006)
    host.regionChanged('para:a', 'x')
    await host.save(DOC_ID, bytes(1, 1), { revision: 1, reason: 'auto' })
    await page.settle()
    expect(page.badge()!.getAttribute('data-erp-save-state')).toBe('LOCAL_ONLY')
    expect(page.badge()!.title).toContain('Không kết nối được máy chủ')
    expect(page.idb.rows('pending')).toHaveLength(1)
  })

  it('after re-locking, a region changed meanwhile asks regionConflict; "mine" sends the edit', async () => {
    const { page, socket, log } = await offlineEdit({ conflict: () => 'mine' })
    expect(log.applied).toEqual([])
    await grantNext(page, socket)
    expect(log.asked).toEqual(['cell:s1:A1'])
    expect(sent(socket, 'region.update')).toMatchObject([{ region: 'cell:s1:A1', payload: 'mine' }])
    socket.receive({ type: 'ack', v: 1, cid: sent(socket, 'region.update')[0].cid, seq: 13 })
    await page.settle()
    expect(log.acks).toEqual([{ revision: 1, version: 1 }])
    expect(page.idb.rows('pending')).toHaveLength(0)
  })

  it('"theirs" drops the edit and shows their content', async () => {
    const { page, socket, log } = await offlineEdit({ conflict: async () => 'theirs' })
    await grantNext(page, socket)
    expect(sent(socket, 'region.update')).toHaveLength(0)
    expect(log.applied).toEqual([['cell:s1:A1', 'theirs', 'm2']])
    expect(sent(socket, 'lock.release')).toEqual([{ type: 'lock.release', v: 1, region: 'cell:s1:A1' }])
  })

  it('an editor without regionConflict: the shell asks with "Giữ bản của tôi" / "Dùng bản mới"', async () => {
    const { page, socket, log } = await offlineEdit()
    await grantNext(page, socket)
    expect(page.dialogId()).toBe('region-conflict')
    const buttons = page.dialog()!.querySelectorAll('button')
    expect(buttons.map(b => b.textContent)).toEqual(['Giữ bản của tôi', 'Dùng bản mới'])
    buttons[1].click()
    await page.settle()
    expect(page.dialogId()).toBeNull()
    expect(log.applied).toEqual([['cell:s1:A1', 'theirs', 'm2']])
    expect(sent(socket, 'region.update')).toHaveLength(0)
  })

  it('the shell\'s "Giữ bản của tôi" sends the edit', async () => {
    const { page, socket } = await offlineEdit()
    await grantNext(page, socket)
    page.dialog()!.querySelectorAll('button')[0].click()
    await page.settle()
    expect(sent(socket, 'region.update')).toMatchObject([{ region: 'cell:s1:A1', payload: 'mine' }])
  })

  it('a room that dropped is waited for: no PUT while the others edit, the edits stay on the device', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    const { page, sockets, host } = await coPage({ office })
    await sync(page, sockets[0])
    office.on(call => (call.path.endsWith('/live-ticket') ? problem(503, 'SERVICE_UNAVAILABLE', { message_vi: 'x', request_id: 'r', retryable: true }) : undefined), false)
    sockets[0].drop(1006)
    host.regionChanged('para:a', 'x')
    await host.save(DOC_ID, bytes(1, 1), { revision: 1, reason: 'auto' })
    await tick(page, 5 * 60 * 1000)
    expect(puts(page)).toHaveLength(0)
    expect(page.idb.rows('pending')).toHaveLength(1)
  })

  it('a room that never answered (no WebSocket through a proxy): after 60 s saves go the v2 way', async () => {
    const office = new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', bytes(1, 2, 3))
    office.on(call => (call.path.endsWith('/live-ticket') ? problem(503, 'SERVICE_UNAVAILABLE', { message_vi: 'x', request_id: 'r', retryable: true }) : undefined), false)
    const { page, host, log } = await coPage({ office })
    host.regionChanged('para:a', 'x')
    expect(await host.save(DOC_ID, bytes(1, 1), { revision: 1, reason: 'auto' })).toEqual({ status: 'offline' })
    await tick(page, 59 * 1000)
    expect(puts(page)).toHaveLength(0)
    await tick(page, 1000)
    expect(puts(page)).toHaveLength(1)
    expect(log.acks).toEqual([{ revision: 1, version: 2 }])
    expect(await host.save(DOC_ID, bytes(2, 2), { revision: 2, reason: 'auto' })).toEqual({ status: 'saved', version: 3 })
  })

  it('without remote changes to that region the edit is simply sent after the join', async () => {
    const { page, sockets, host } = await coPage({ conflict: () => 'theirs' })
    await sync(page, sockets[0])
    sockets[0].drop(1006)
    host.regionChanged('para:q', 'mine')
    await tick(page, 5 * 1000)
    await sync(page, sockets[1], {}, [update(12, 'para:other', 'x')])
    await grantNext(page, sockets[1])
    expect(sent(sockets[1], 'region.update')).toMatchObject([{ region: 'para:q', payload: 'mine' }])
    expect(page.dialogId()).toBeNull()
  })
})
