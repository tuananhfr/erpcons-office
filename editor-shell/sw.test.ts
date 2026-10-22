import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { EDITORS } from '../src/config/editors.ts'
import { FakeIdb } from './fake-idb.ts'

type Strategy = 'bypass' | 'network-first' | 'cache-first'
type FakeResponse = { status: number; type: string; body: string; clone: () => FakeResponse }
type Req = string | { url: string; method?: string; mode?: string }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SOURCE = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
const CURRENT = 'erpcons-office-__BUILD_ID__'
const origin = 'https://office.erpcons.ai'
const at = (p: string) => new URL(p, origin)
const u = (p: string) => `${origin}${p}`

function response(status: number, body = ''): FakeResponse {
  const r: FakeResponse = { status, type: 'basic', body, clone: () => r }
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
  const fetched: string[] = []
  const network = options.network ?? (() => response(200, 'net'))
  const source = options.manifest === null ? SOURCE : SOURCE.replace('/*__ASSET_MANIFEST__*/[]', JSON.stringify(options.manifest ?? []))
  const context = {
    URL,
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
      crypto: { randomUUID: () => 'shared-1' },
      skipWaiting: () => {},
      clients: {
        claim: async () => {},
        matchAll: async () => [
          ...(options.windows ?? []).map((p, i) => ({ id: `other-${i}`, url: u(p) })),
          { id: 'fetching', url: 'about:blank' },
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

  it('keeps build and manifest placeholders for assemble to fill in', () => {
    expect(SOURCE).toContain('__BUILD_ID__')
    expect(SOURCE).toContain('/*__ASSET_MANIFEST__*/[]')
  })
})

describe('sw fetch strategies', () => {
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
    const w = loadWorker({ caches: { [CURRENT]: { '/brand/erpcons-mark.svg': 'svg' } } })
    await w.message({ type: 'erpcons-warm', urls: [u('/van-ban/'), u('/van-ban/a_bg.wasm'), u('/brand/erpcons-mark.svg')] })
    expect(w.fetched).toEqual([u('/van-ban/'), u('/van-ban/a_bg.wasm')])
    expect(w.paths()).toEqual(['/brand/erpcons-mark.svg', '/van-ban/', '/van-ban/a_bg.wasm'])
  })

  it('stores only full 200 responses and survives a failing URL', async () => {
    const w = loadWorker({ network: (url) => (url.endsWith('missing.js') ? response(404) : url.endsWith('down.js') ? 'offline' : response(200)) })
    await w.message({ type: 'erpcons-warm', urls: [u('/missing.js'), u('/down.js'), u('/pdf/')] })
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
  const shared = (name: string, size = 10) => ({ name, size })
  const form = (...files: unknown[]) => ({ getAll: (key: string) => (key === 'file' ? files : []) }) as unknown as FormData

  it('queues a shared file for its editor and opens it with ?open=', async () => {
    const idb = new FakeIdb()
    const res = await (await loadWorker({ idb }).share(form(shared('Báo cáo.DOCX'))))!
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(u('/van-ban/?open=shared-1'))
    expect(idb.rows('pending')).toMatchObject([{ id: 'shared-1', name: 'Báo cáo.DOCX', editor: 'van-ban', file: { size: 10 } }])
    expect(idb.rows('pending')[0].expiresAt).toBeGreaterThan(Date.now())
  })

  it('routes every editor extension the site knows to that editor', async () => {
    for (const e of EDITORS) {
      const res = await (await loadWorker().share(form(shared(`a${e.extension}`))))!
      expect(res.headers.get('location')).toBe(u(`/${e.slug}/?open=shared-1`))
    }
  })

  it('takes the first supported file when several are shared', async () => {
    const res = await (await loadWorker().share(form(shared('anh.jpg'), shared('so.xlsx'))))!
    expect(res.headers.get('location')).toBe(u('/bang-tinh/?open=shared-1'))
  })

  it('explains unsupported, empty, oversized and unreadable shares in Vietnamese', async () => {
    const w = loadWorker()
    const cases: [FormData | 'broken', number, string][] = [
      [form(shared('anh.jpg')), 415, 'DOCX, XLSX, PPTX hoặc PDF'],
      [form(shared('a.pdf', 0)), 422, 'đang trống'],
      [form(shared('a.pdf', 101 * 1024 * 1024)), 413, '100 MB'],
      ['broken', 400, 'Không đọc được'],
    ]
    for (const [body, status, text] of cases) {
      const res = await (await w.share(body))!
      expect(res.status).toBe(status)
      expect(await res.text()).toContain(text)
    }
  })

  it('refuses a share posted from another site', async () => {
    const idb = new FakeIdb()
    const res = await (await loadWorker({ idb }).share(form(shared('a.pdf')), 'https://evil.example/x'))!
    expect(res.status).toBe(403)
    expect(idb.rows('pending')).toEqual([])
  })

  it('says so when the device cannot hold the file', async () => {
    const idb = new FakeIdb()
    idb.failWrites = 'QuotaExceededError'
    const res = await (await loadWorker({ idb }).share(form(shared('a.pdf'))))!
    expect(res.status).toBe(507)
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
