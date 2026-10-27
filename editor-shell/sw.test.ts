import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { EDITORS } from '../src/config/editors.ts'
import { serviceWorkerIntake } from '../src/lib/editor-shell/assets.ts'
import { SIGNATURE_RULES } from '../src/lib/files/intake-contract.ts'
import { FakeIdb } from './fake-idb.ts'

type Strategy = 'bypass' | 'network-first' | 'cache-first'
type FakeResponse = { status: number; type: string; body: string; clone: () => FakeResponse; text: () => Promise<string> }
type Req = string | { url: string; method?: string; mode?: string }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
const INTAKE = serviceWorkerIntake(__dirname)
const CURRENT = 'erpcons-office-__BUILD_ID__'
const origin = 'https://office.erpcons.ai'
const at = (p: string) => new URL(p, origin)
const u = (p: string) => `${origin}${p}`

function response(status: number, body = ''): FakeResponse {
  const r: FakeResponse = { status, type: 'basic', body, clone: () => r, text: async () => body }
  return r
}

const keyOf = (req: Req) => (typeof req === 'string' ? req : req.url)

class FakeCache {
  entries = new Map<string, FakeResponse>()
  async match(req: Req, options?: { ignoreSearch?: boolean }) {
    const key = keyOf(req)
    if (this.entries.has(key)) return this.entries.get(key)
    if (options?.ignoreSearch) {
      const bare = key.split('?')[0]
      for (const [k, v] of this.entries) if (k.split('?')[0] === bare) return v
    }
    return undefined
  }
  async put(req: Req, res: FakeResponse) { this.entries.set(keyOf(req), res) }
  async keys() { return [...this.entries.keys()].map((url) => ({ url })) }
  async delete(req: Req) { return this.entries.delete(keyOf(req)) }
}

interface WorkerOptions {
  caches?: Record<string, Record<string, string>>
  manifest?: string[] | null
  network?: (url: string) => FakeResponse | 'offline'
  // Other windows already open on the site (the page being fetched is not among them).
  windows?: string[]
  idb?: FakeIdb
}

function loadWorker(options: WorkerOptions = {}) {
  const listeners: Record<string, unknown> = {}
  const store = new Map<string, FakeCache>()
  for (const [name, entries] of Object.entries(options.caches ?? {})) {
    const cache = new FakeCache()
    for (const [p, body] of Object.entries(entries)) cache.entries.set(u(p), response(200, body))
    store.set(name, cache)
  }
  const messages: unknown[] = []
  const skipWaiting = vi.fn(async () => {})
  const fetched: string[] = []
  const network = options.network ?? (() => response(200, 'net'))
  const filled = SOURCE.replace('/*__INTAKE__*/', () => INTAKE)
  const source = options.manifest === null ? filled : filled.replace('/*__ASSET_MANIFEST__*/[]', JSON.stringify(options.manifest ?? []))
  let uuid = 0
  const context = {
    URL,
    console: { warn: vi.fn() },
    Promise,
    Response,
    indexedDB: options.idb ?? new FakeIdb(),
    caches: {
      open: async (name: string) => { if (!store.has(name)) store.set(name, new FakeCache()); return store.get(name) },
      keys: async () => [...store.keys()],
      delete: async (name: string) => store.delete(name),
    },
    fetch: async (req: Req) => {
      const url = keyOf(req)
      fetched.push(url)
      const r = network(url)
      if (r === 'offline') throw new TypeError('Failed to fetch')
      return r
    },
    self: {
      addEventListener: (type: string, fn: unknown) => { listeners[type] = fn },
      location: { origin },
      crypto: { randomUUID: () => `id-${++uuid}` },
      skipWaiting,
      clients: {
        claim: async () => {},
        matchAll: async () => [
          ...(options.windows ?? []).map((p, i) => ({ id: `other-${i}`, url: u(p) })),
          { id: 'fetching', url: 'about:blank', postMessage: (data: unknown) => messages.push(data) },
        ],
      },
    },
  }
  vm.runInNewContext(source, context)
  const api = context as unknown as {
    classify: (u: URL, m: string, mode: string, o: string) => Strategy
    warmableUrls: (urls: unknown, origin: string) => string[]
  }
  async function dispatch(type: string, event: Record<string, unknown>) {
    let done: Promise<unknown> = Promise.resolve()
    let responded: Promise<unknown> | undefined
    ;(listeners[type] as (e: unknown) => void)({
      ...event,
      waitUntil: (p: Promise<unknown>) => { done = p },
      respondWith: (p: Promise<unknown>) => { responded = p },
    })
    await done
    return responded
  }
  const paths = (name = CURRENT) => [...(store.get(name)?.entries.keys() ?? [])].map((k) => k.slice(origin.length)).sort()
  return {
    warnings: context.console.warn,
    messages,
    skipWaiting,
    install: () => dispatch('install', {}),
    classify: api.classify,
    warmableUrls: api.warmableUrls,
    listeners,
    store,
    fetched,
    paths,
    message: (data: unknown) => dispatch('message', { data }),
    activate: () => dispatch('activate', {}),
    fetchPage: (p: string) => dispatch('fetch', { request: { url: u(p), method: 'GET', mode: 'navigate' }, resultingClientId: 'fetching' }) as Promise<Promise<FakeResponse>>,
    share: (form: FormData | 'broken', referrer = '') => dispatch('fetch', {
      request: {
        url: u('/share-target/'), method: 'POST', mode: 'navigate', referrer,
        formData: async () => { if (form === 'broken') throw new TypeError('bad body'); return form },
      },
    }) as Promise<Promise<Response>>,
    dispatchRaw: (event: Record<string, unknown>) => dispatch('fetch', event),
    fetchAsset: (p: string) => dispatch('fetch', { request: { url: u(p), method: 'GET', mode: 'cors' } }) as Promise<Promise<FakeResponse>>,
  }
}

describe('sw classify', () => {
  const { classify, listeners } = loadWorker()

  it('registers install, activate, fetch and message handlers', () => {
    expect(Object.keys(listeners).sort()).toEqual(['activate', 'fetch', 'install', 'message'])
  })

  it('uses network-first for pages', () => {
    expect(classify(at('/van-ban/'), 'GET', 'navigate', origin)).toBe('network-first')
    expect(classify(at('/'), 'GET', 'navigate', origin)).toBe('network-first')
    expect(classify(at('/van-ban/index.html'), 'GET', 'no-cors', origin)).toBe('network-first')
  })

  it('uses cache-first for hashed engine files', () => {
    expect(classify(at('/van-ban/wordcraft-web-a4ceca68febdadee_bg.wasm'), 'GET', 'cors', origin)).toBe('cache-first')
    expect(classify(at('/_next/static/chunks/app.js'), 'GET', 'no-cors', origin)).toBe('cache-first')
  })

  it('never handles writes, other origins or the worker itself', () => {
    expect(classify(at('/van-ban/'), 'POST', 'navigate', origin)).toBe('bypass')
    expect(classify(new URL('https://example.com/a.js'), 'GET', 'cors', origin)).toBe('bypass')
    expect(classify(at('/sw.js'), 'GET', 'no-cors', origin)).toBe('bypass')
  })

  it('never handles the PI sign-in pages or the PI issuer and API', () => {
    expect(classify(at('/dang-nhap/'), 'GET', 'navigate', origin)).toBe('bypass')
    expect(classify(at('/dang-nhap/callback/?code=c1&state=s1'), 'GET', 'navigate', origin)).toBe('bypass')
    expect(classify(new URL('https://id.pi.invalid/.well-known/openid-configuration'), 'GET', 'cors', origin)).toBe('bypass')
    expect(classify(new URL('https://id.pi.invalid/v1/me/entitlements?product_id=vanban'), 'GET', 'cors', origin)).toBe('bypass')
  })

  it('keeps build and manifest placeholders for assemble to fill in', () => {
    expect(SOURCE).toContain('__BUILD_ID__')
    expect(SOURCE).toContain('/*__ASSET_MANIFEST__*/[]')
    expect(SOURCE).toContain('/*__INTAKE__*/')
  })
})

describe('sw fetch strategies', () => {
  it.each(['HTML', 'wasm'])('returns fresh %s when put rejects and preserves old cached files', async (kind) => {
    const page = kind === 'HTML'
    const oldPath = page ? '/van-ban/' : '/van-ban/old_bg.wasm'
    const freshPath = page ? oldPath : '/van-ban/new_bg.wasm'
    const fresh = response(200, 'fresh')
    const w = loadWorker({
      caches: { [CURRENT]: { [oldPath]: 'old' } },
      manifest: ['/van-ban/', '/van-ban/new_bg.wasm'],
      network: () => fresh,
    })
    const cache = w.store.get(CURRENT)!
    const old = cache.entries.get(u(oldPath))
    const put = vi.spyOn(cache, 'put').mockRejectedValue(new DOMException('full', 'QuotaExceededError'))
    const remove = vi.spyOn(cache, 'delete')
    const result = page ? await w.fetchPage(freshPath) : await w.fetchAsset(freshPath)
    expect(result).toBe(fresh)
    expect(put).toHaveBeenCalledOnce()
    expect(cache.entries.get(u(oldPath))).toBe(old)
    expect(w.paths()).toEqual([oldPath])
    expect(remove).not.toHaveBeenCalled()
    expect(w.warnings).toHaveBeenCalledOnce()
    expect(w.messages).toEqual([{ type: 'erpcons-quota' }])
  })

  it('returns the fresh page when pruning rejects', async () => {
    const fresh = response(200, 'fresh')
    const w = loadWorker({
      caches: { [CURRENT]: { '/van-ban/': 'old' } },
      manifest: ['/van-ban/'],
      network: () => fresh,
    })
    vi.spyOn(w.store.get(CURRENT)!, 'keys').mockRejectedValue(new Error('cache unavailable'))
    expect(await w.fetchPage('/van-ban/')).toBe(fresh)
    expect(w.warnings).toHaveBeenCalledOnce()
  })

  it('does not store a 206 range reply', async () => {
    const w = loadWorker({ network: () => response(206) })
    expect((await (await w.fetchAsset('/van-ban/a_bg.wasm'))!).status).toBe(206)
    expect(w.paths()).toEqual([])
  })

  it('serves a cached page, ignoring the query, when the network is down', async () => {
    const w = loadWorker({ caches: { [CURRENT]: { '/van-ban/': 'old page' } }, network: () => 'offline' })
    expect((await (await w.fetchPage('/van-ban/?from=home'))!).body).toBe('old page')
  })
})

describe('sw and PI sign-in', () => {
  it('leaves the OIDC callback to the network: never stored, never served from cache offline', async () => {
    const online = loadWorker()
    expect(await online.fetchPage('/dang-nhap/callback/?code=c1&state=s1')).toBeUndefined()
    expect(await online.fetchPage('/dang-nhap/')).toBeUndefined()
    expect(online.fetched).toEqual([])
    expect(online.paths()).toEqual([])
    const offline = loadWorker({ caches: { [CURRENT]: { '/dang-nhap/callback/?code=old&state=old': 'stale', '/': 'home' } }, network: () => 'offline' })
    expect(await offline.fetchPage('/dang-nhap/callback/?code=c2&state=s2')).toBeUndefined()
  })

  it('never caches a request that carries an Authorization header', async () => {
    const w = loadWorker()
    const headers = new Headers({ Authorization: 'Bearer at-1' })
    expect(await w.dispatchRaw({ request: { url: u('/v1/me'), method: 'GET', mode: 'cors', headers } })).toBeUndefined()
    expect(w.paths()).toEqual([])
  })

  it('does not warm sign-in pages a tab reports', () => {
    const { warmableUrls } = loadWorker()
    expect(warmableUrls([u('/dang-nhap/callback/?code=c1&state=s1'), u('/dang-nhap/'), u('/')], origin)).toEqual([u('/')])
  })
})

describe('sw warm-up', () => {
  it('keeps same-origin URLs once, without fragments, and skips the worker itself', () => {
    const { warmableUrls } = loadWorker()
    expect(warmableUrls([
      u('/van-ban/'), u('/van-ban/#top'), u('/van-ban/a_bg.wasm'), u('/sw.js'),
      'https://example.com/x.js', 'blob:https://office.erpcons.ai/1', 'not a url', 42,
    ], origin)).toEqual([u('/van-ban/'), u('/van-ban/a_bg.wasm')])
    expect(warmableUrls('nope', origin)).toEqual([])
  })

  it('caches what the page already loaded so the first visit works offline', async () => {
    const w = loadWorker({ caches: { [CURRENT]: { '/brand/erpcons-mark.svg': 'svg', '/nhan-tep/': 'batch page' } } })
    await w.message({ type: 'erpcons-warm', urls: [u('/van-ban/'), u('/van-ban/a_bg.wasm'), u('/brand/erpcons-mark.svg')] })
    expect(w.fetched).toEqual([u('/van-ban/'), u('/van-ban/a_bg.wasm')])
    expect(w.paths()).toEqual(['/brand/erpcons-mark.svg', '/nhan-tep/', '/van-ban/', '/van-ban/a_bg.wasm'])
  })

  it('stores only full 200 responses and survives a failing URL', async () => {
    const w = loadWorker({ network: (url) => (url.endsWith('missing.js') ? response(404) : url.endsWith('down.js') ? 'offline' : response(200)) })
    await w.message({ type: 'erpcons-warm', urls: [u('/missing.js'), u('/down.js'), u('/pdf/')] })
    expect(w.paths()).toEqual(['/nhan-tep/', '/pdf/'])
  })

  it('warms the share batch page with the scripts and styles its HTML names, whichever page reports', async () => {
    const html = '<link rel="stylesheet" href="/_next/static/chunks/a.css"/><link rel="preload" href="/_next/static/media/f.woff2"/>'
      + '<script src="/_next/static/chunks/b.js" async=""></script><img src="/brand/mark.svg"/>'
      + '<a href="/van-ban/">x</a><script src="//cdn.example.com/x.js"></script><script src="https://example.com/y.js"></script>'
    const w = loadWorker({ network: (url) => response(200, url === u('/nhan-tep/') ? html : 'asset') })
    await w.message({ type: 'erpcons-warm', urls: [u('/')] })
    expect(w.paths()).toEqual(['/', '/_next/static/chunks/a.css', '/_next/static/chunks/b.js', '/_next/static/media/f.woff2', '/brand/mark.svg', '/nhan-tep/'])
    const before = w.fetched.length
    await w.message({ type: 'erpcons-warm', urls: [u('/')] })
    expect(w.fetched.length).toBe(before)
  })

  it('does not keep a batch page it could not fetch whole', async () => {
    const w = loadWorker({ network: (url) => (url === u('/nhan-tep/') ? response(404) : response(200)) })
    await w.message({ type: 'erpcons-warm', urls: [u('/pdf/')] })
    expect(w.paths()).toEqual(['/pdf/'])
  })

  it('ignores unrelated messages', async () => {
    const w = loadWorker()
    await w.message({ type: 'other', urls: [u('/pdf/')] })
    await w.message(null)
    expect(w.fetched).toEqual([])
  })
})

describe('sw across deploys', () => {
  const OLD = 'erpcons-office-0123456789ab'

  it('carries the previous build over so editors stay usable offline after a deploy', async () => {
    const w = loadWorker({
      caches: {
        [OLD]: { '/pdf/': 'old pdf page', '/pdf/pdfcraft-web-old_bg.wasm': 'old wasm', '/van-ban/': 'old doc page' },
        [CURRENT]: { '/van-ban/': 'new doc page' },
        'someone-else': { '/x': 'x' },
      },
    })
    await w.activate()
    expect([...w.store.keys()].sort()).toEqual([CURRENT, 'someone-else'])
    expect(w.paths()).toEqual(['/pdf/', '/pdf/pdfcraft-web-old_bg.wasm', '/van-ban/'])
    expect(w.store.get(CURRENT)!.entries.get(u('/van-ban/'))!.body).toBe('new doc page')
  })

  it('drops files of an older build once that page is fetched fresh', async () => {
    const manifest = ['/', '/_next/static/new.js', '/van-ban/', '/van-ban/new_bg.wasm', '/pdf/', '/pdf/new_bg.wasm']
    const w = loadWorker({
      manifest,
      caches: {
        [CURRENT]: {
          '/': 'old landing', '/_next/static/old.js': 'o', '/_next/static/new.js': 'n',
          '/van-ban/': 'old', '/van-ban/old_bg.wasm': 'o', '/van-ban/new_bg.wasm': 'n',
          '/pdf/': 'old', '/pdf/old_bg.wasm': 'o', '/brand/erpcons-mark.svg': 'svg',
        },
      },
    })
    await (await w.fetchPage('/van-ban/'))
    expect(w.paths()).not.toContain('/van-ban/old_bg.wasm')
    expect(w.paths()).toContain('/pdf/old_bg.wasm')
    await (await w.fetchPage('/'))
    expect(w.paths()).toEqual(['/', '/_next/static/new.js', '/pdf/', '/pdf/old_bg.wasm', '/van-ban/', '/van-ban/new_bg.wasm'])
  })

  it('keeps an older build while another tab still runs that page', async () => {
    const manifest = ['/', '/van-ban/', '/van-ban/new_bg.wasm', '/pdf/']
    const caches = { [CURRENT]: { '/van-ban/': 'old', '/van-ban/old_font.ttf': 'o', '/pdf/old_bg.wasm': 'o' } }
    const busy = loadWorker({ manifest, caches, windows: ['/van-ban/?open=x'] })
    await (await busy.fetchPage('/van-ban/'))
    expect(busy.paths()).toContain('/van-ban/old_font.ttf')

    // A tab on another editor does not hold this page's files.
    const other = loadWorker({ manifest, caches, windows: ['/pdf/'] })
    await (await other.fetchPage('/van-ban/'))
    expect(other.paths()).not.toContain('/van-ban/old_font.ttf')
  })

  it('never prunes when the manifest was not filled in', async () => {
    const w = loadWorker({ manifest: null, caches: { [CURRENT]: { '/van-ban/': 'old', '/van-ban/old_bg.wasm': 'o' } } })
    await (await w.fetchPage('/van-ban/'))
    expect(w.paths()).toEqual(['/van-ban/', '/van-ban/old_bg.wasm'])
  })
})

describe('sw share target', () => {
  const MB = 1024 * 1024
  const ZIP = [0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]
  const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  const head = (ext: string): number[] => {
    const kind = SIGNATURE_RULES[ext]?.[0]
    if (kind === 'zip') return ZIP
    if (kind === 'ole') return OLE
    if (kind === 'rtf') return [...Buffer.from('{\\rtf1 x}')]
    if (kind === 'pdf') return [...Buffer.from('%PDF-1.7\n')]
    return [...Buffer.from('plain text;1;2\n')]
  }
  // A real File (IndexedDB clones it); `size` can be faked so limits are testable without allocating 100 MB.
  const shared = (name: string, { bytes = head(name.split('.').pop()!.toLowerCase()), size, type = '' }: { bytes?: number[]; size?: number; type?: string } = {}) => {
    const file = new File([new Uint8Array(bytes)], name, { type })
    if (size !== undefined) Object.defineProperty(file, 'size', { value: size })
    return file
  }
  const form = (files: unknown[], fields: Record<string, string> = {}) => ({
    getAll: (key: string) => (key === 'file' ? files : []),
    get: (key: string) => fields[key] ?? null,
  }) as unknown as FormData
  const location = (res: Response) => res.headers.get('location')
  type Row = { id: string; name: string; state: string; errorCode: string | null; reason: string | null; file?: File; editor: string | null; batchId: string; position?: number }
  const rows = (idb: FakeIdb) => (idb.rows('pending') as unknown as Row[]).sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))

  it('shows the cached batch page, query ignored, when a batch arrives offline', async () => {
    let online = true
    const html = '<h1>Nhận tệp</h1><script src="/_next/static/chunks/b.js"></script>'
    const w = loadWorker({ network: (url) => (!online ? 'offline' : response(200, url === u('/nhan-tep/') ? html : 'js')) })
    await w.message({ type: 'erpcons-warm', urls: [u('/')] })
    online = false
    const res = await (await w.share(form([shared('a.docx'), shared('b.pdf')])))!
    const target = location(res)!
    expect(target).toBe(u('/nhan-tep/?batch=id-1'))
    expect((await (await w.fetchPage(target.slice(origin.length)))!).body).toBe(html)
    expect((await (await w.fetchAsset('/_next/static/chunks/b.js'))!).body).toBe('js')
  })

  it('replaces a carried-over batch page whose chunks a deploy pruned, before the next offline batch', async () => {
    const OLD = 'erpcons-office-0123456789ab'
    const oldHtml = '<h1>old</h1><script src="/_next/static/chunks/old.js"></script>'
    const newHtml = '<h1>new</h1><script src="/_next/static/chunks/new.js"></script>'
    let online = true
    const w = loadWorker({
      caches: { [OLD]: { '/': 'old landing', '/nhan-tep/': oldHtml, '/_next/static/chunks/old.js': 'old js' } },
      manifest: ['/', '/nhan-tep/', '/_next/static/chunks/new.js'],
      network: (url) => (!online ? 'offline' : response(200, url === u('/nhan-tep/') ? newHtml : url.endsWith('new.js') ? 'new js' : 'landing')),
    })
    await w.activate()
    await w.fetchPage('/')
    expect(w.paths()).not.toContain('/_next/static/chunks/old.js')
    await w.message({ type: 'erpcons-warm', urls: [u('/')] })
    online = false
    const res = await (await w.share(form([shared('a.docx'), shared('b.pdf')])))!
    expect((await (await w.fetchPage(location(res)!.slice(origin.length)))!).body).toBe(newHtml)
    expect((await (await w.fetchAsset('/_next/static/chunks/new.js'))!).body).toBe('new js')
  })

  it('keeps the previous batch page when one of the new assets cannot be stored', async () => {
    const w = loadWorker({
      caches: { [CURRENT]: { '/nhan-tep/': '<script src="/_next/static/chunks/old.js"></script>' } },
      manifest: ['/nhan-tep/', '/_next/static/chunks/new.js'],
      network: (url) => (url === u('/nhan-tep/') ? response(200, '<script src="/_next/static/chunks/new.js"></script>') : response(500)),
    })
    await w.message({ type: 'erpcons-warm', urls: [] })
    expect(w.store.get(CURRENT)!.entries.get(u('/nhan-tep/'))!.body).toContain('old.js')
  })

  it('opens a single valid file straight in its editor, as before', async () => {
    const idb = new FakeIdb()
    const type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const res = await (await loadWorker({ idb }).share(form([shared('Báo cáo.DOCX', { type })])))!
    expect(res.status).toBe(303)
    expect(location(res)).toBe(u('/van-ban/?open=id-2'))
    const [row] = idb.rows('pending')
    expect(row).toMatchObject({
      id: 'id-2', batchId: 'id-1', sourceMode: 'SHARE_IN', name: 'Báo cáo.DOCX', editor: 'van-ban', state: 'READY', size: 6,
      claimedMime: type, errorCode: null, recoverable: false,
    })
    expect((row.file as File).size).toBe(6)
    expect(row.expiresAt).toBeGreaterThan(Date.now())
    expect(row.createdAt).toBeLessThanOrEqual(Date.now())
  })

  it('routes every accepted extension to the editor that declares it', async () => {
    for (const editor of EDITORS) {
      for (const ext of editor.accepts) {
        const res = await (await loadWorker().share(form([shared(`tệp.${ext}`)])))!
        expect(location(res), ext).toBe(u(`/${editor.slug}/?open=id-2`))
      }
    }
  })

  it('checks every file of a batch on its own and sends the batch to /nhan-tep/', async () => {
    const idb = new FakeIdb()
    const files = [shared('a.docx'), shared('anh.jpg'), shared('b.xlsx'), shared('trong.pdf', { bytes: [] }), shared('c.pdf')]
    const res = await (await loadWorker({ idb }).share(form(files)))!
    expect(location(res)).toBe(u('/nhan-tep/?batch=id-1'))
    expect(rows(idb).map(r => [r.name, r.batchId, r.state, r.errorCode, r.reason, r.editor, Boolean(r.file)])).toEqual([
      ['a.docx', 'id-1', 'READY', null, null, 'van-ban', true],
      ['anh.jpg', 'id-1', 'FAILED_FINAL', 'UNSUPPORTED_TYPE', 'unsupported', null, false],
      ['b.xlsx', 'id-1', 'READY', null, null, 'bang-tinh', true],
      ['trong.pdf', 'id-1', 'FAILED_FINAL', 'INVALID_SIGNATURE', 'empty', 'pdf', false],
      ['c.pdf', 'id-1', 'READY', null, null, 'pdf', true],
    ])
    expect(rows(idb).map(r => r.position)).toEqual([0, 1, 2, 3, 4])
  })

  it('refuses the sixth file and later ones without reading them', async () => {
    const idb = new FakeIdb()
    const sixth = shared('f.pdf')
    const slice = vi.spyOn(sixth, 'slice')
    const res = await (await loadWorker({ idb }).share(form(['1', '2', '3', '4', '5'].map(n => shared(`${n}.pdf`)).concat(sixth))))!
    expect(location(res)).toBe(u('/nhan-tep/?batch=id-1'))
    const all = rows(idb)
    expect(all.filter(r => r.state === 'READY')).toHaveLength(5)
    expect(all.find(r => r.name === 'f.pdf')).toMatchObject({ state: 'FAILED_FINAL', errorCode: 'QUOTA_EXCEEDED', reason: 'tooMany' })
    expect(slice).not.toHaveBeenCalled()
  })

  it('keeps each file under 100 MB and the batch under 200 MB', async () => {
    const idb = new FakeIdb()
    const sizes = [90, 101, 90, 30, 20]
    await (await loadWorker({ idb }).share(form(sizes.map((size, i) => shared(`${'abcde'[i]}.pdf`, { size: size * MB })))))!
    expect(rows(idb).map(r => [r.name, r.state, r.reason, r.errorCode])).toEqual([
      ['a.pdf', 'READY', null, null],
      ['b.pdf', 'FAILED_FINAL', 'tooLarge', 'TOO_LARGE'],
      ['c.pdf', 'READY', null, null],
      ['d.pdf', 'FAILED_FINAL', 'batchTooLarge', 'QUOTA_EXCEEDED'],
      ['e.pdf', 'READY', null, null],
    ])
  })

  it('refuses content that contradicts the extension (a PDF renamed .docx), even alone', async () => {
    const idb = new FakeIdb()
    const res = await (await loadWorker({ idb }).share(form([shared('hop-dong.docx', { bytes: [...Buffer.from('%PDF-1.7')] })])))!
    expect(location(res)).toBe(u('/nhan-tep/?batch=id-1'))
    expect(rows(idb)).toMatchObject([{ state: 'FAILED_FINAL', errorCode: 'INVALID_SIGNATURE', reason: 'signature' }])
    expect(rows(idb)[0].file).toBeUndefined()
  })

  it('accepts a PDF preamble inside the first KB but not beyond it', async () => {
    const pdf = [...Buffer.from('%PDF-1.4')]
    const idb = new FakeIdb()
    const files = [shared('a.pdf', { bytes: [...new Array(1000).fill(32), ...pdf] }), shared('b.pdf', { bytes: [...new Array(1020).fill(32), ...pdf] })]
    await (await loadWorker({ idb }).share(form(files)))!
    expect(rows(idb).map(r => [r.name, r.state])).toEqual([['a.pdf', 'READY'], ['b.pdf', 'FAILED_FINAL']])
  })

  it('answers a link or text without a file with guidance, never fetching or echoing it', async () => {
    const w = loadWorker()
    const secret = 'https://zalo.me/private/abc?token=s3cret'
    const res = await (await w.share(form([], { title: 'Hợp đồng', text: 'xem', url: secret })))!
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('Ứng dụng nguồn chỉ gửi liên kết, không gửi tệp')
    expect(html).toContain('<a href="/">Chọn tệp trên máy</a>')
    expect(html).not.toContain('s3cret')
    expect(html).not.toContain('Hợp đồng')
    expect(w.fetched).toEqual([])
    expect(w.warnings).not.toHaveBeenCalled()
  })

  it('explains an empty or unreadable share in Vietnamese with its code', async () => {
    const w = loadWorker()
    const cases: [FormData | 'broken', number, string][] = [
      [form([]), 415, '(Mã: UNSUPPORTED_TYPE)'],
      [form(['not a file']), 415, 'tệp văn bản, bảng tính, trình chiếu hoặc PDF'],
      ['broken', 400, 'Không đọc được tệp được chia sẻ. Ứng dụng nguồn có thể đã đóng; hãy chia sẻ lại. (Mã: SOURCE_UNAVAILABLE)'],
    ]
    for (const [body, status, text] of cases) {
      const res = await (await w.share(body))!
      expect(res.status).toBe(status)
      expect(await res.text()).toContain(text)
    }
  })

  it('prunes expired entries whenever a share arrives', async () => {
    const idb = new FakeIdb()
    const w = loadWorker({ idb })
    await (await w.share(form([shared('a.pdf')])))!
    idb.seed('pending', { id: 'old', name: 'old.pdf', editor: 'pdf', expiresAt: Date.now() - 1 })
    await (await w.share(form([shared('b.pdf')])))!
    expect(rows(idb).map(r => r.name).sort()).toEqual(['a.pdf', 'b.pdf'])
  })

  it('refuses a share posted from another site', async () => {
    const idb = new FakeIdb()
    const res = await (await loadWorker({ idb }).share(form([shared('a.pdf')]), 'https://evil.example/x'))!
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('(Mã: ACCESS_DENIED)')
    expect(idb.rows('pending')).toEqual([])
  })

  it('says so when the device cannot hold the files', async () => {
    const idb = new FakeIdb()
    idb.failWrites = 'QuotaExceededError'
    const res = await (await loadWorker({ idb }).share(form([shared('a.pdf')])))!
    expect(res.status).toBe(507)
    expect(await res.text()).toContain('(Mã: QUOTA_EXCEEDED)')
  })

  it('leaves other POSTs to the network', async () => {
    const w = loadWorker()
    const responded = await w.dispatchRaw({ request: { url: u('/van-ban/'), method: 'POST', mode: 'navigate' } })
    expect(responded).toBeUndefined()
  })
})

describe('sw offline page', () => {
  it('explains in Vietnamese when a page was never cached and the network is down', async () => {
    const w = loadWorker({ network: () => 'offline' })
    const res = (await (await w.fetchPage('/bang-tinh/?open=abc'))!) as unknown as Response
    expect(res.status).toBe(503)
    const html = await res.text()
    expect(html).toContain('kiểm tra kết nối mạng')
    expect(html).toContain('href="/bang-tinh/?open=abc"')
  })

  it('still fails non-page requests so the page sees a network error', async () => {
    const w = loadWorker({ network: () => 'offline' })
    await expect(w.fetchAsset('/bang-tinh/a_bg.wasm').then(p => p)).rejects.toThrow('Failed to fetch')
  })
})


it('waits for an explicit update action before skipping waiting', async () => {
  const w = loadWorker()
  await w.install()
  expect(w.skipWaiting).not.toHaveBeenCalled()
  await w.message({ type: 'erpcons-apply-update' })
  expect(w.skipWaiting).toHaveBeenCalledOnce()
})
