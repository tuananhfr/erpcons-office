export type Resolved = { kind: 'file'; rel: string } | { kind: 'redirect'; location: string } | { kind: 'forbidden' }

/** Mirrors Apache's DirectorySlash + DirectoryIndex so local preview matches production URLs. */
export function resolveRequest(rawUrl: string, isDirectory: (rel: string) => boolean): Resolved {
  const queryAt = rawUrl.indexOf('?')
  const rawPath = queryAt === -1 ? rawUrl : rawUrl.slice(0, queryAt)
  const query = queryAt === -1 ? '' : rawUrl.slice(queryAt)
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    return { kind: 'forbidden' }
  }
  // fs.stat throws on NUL synchronously, which would take the whole preview server down.
  if (decoded.includes('\0')) return { kind: 'forbidden' }
  const segments = decoded.split(/[\\/]/)
  if (segments.some((s) => s === '..' || s === '.')) return { kind: 'forbidden' }
  const rel = segments.filter(Boolean).join('/')
  const endsWithSlash = rawPath.endsWith('/')
  if (rel === '' || isDirectory(rel)) {
    if (!endsWithSlash) return { kind: 'redirect', location: `/${rel}/${query}` }
    return { kind: 'file', rel: rel === '' ? 'index.html' : `${rel}/index.html` }
  }
  return { kind: 'file', rel }
}

export function pickEncoding(acceptEncoding: string | undefined, available: { br: boolean; gzip: boolean }): 'br' | 'gzip' | null {
  if (!acceptEncoding) return null
  const accepted = new Map<string, number>()
  for (const part of acceptEncoding.split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';')
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='))
    accepted.set(name, q ? Number(q.slice(2)) : 1)
  }
  const allowed = (name: string) => (accepted.get(name) ?? accepted.get('*') ?? 0) > 0
  if (available.br && allowed('br')) return 'br'
  if (available.gzip && allowed('gzip')) return 'gzip'
  return null
}

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json', wasm: 'application/wasm', svg: 'image/svg+xml',
  webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', ico: 'image/x-icon', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml', webmanifest: 'application/manifest+json',
}

export function contentTypeFor(rel: string): string {
  const ext = rel.slice(rel.lastIndexOf('.') + 1).toLowerCase()
  return TYPES[ext] ?? 'application/octet-stream'
}

// trunk appends a 16-hex content hash; Next puts hashed assets under _next/static.
const HASHED = /(^|\/)_next\/static\/|-[0-9a-f]{16}(_bg)?\.[a-z0-9]+$/

export function cacheControlFor(rel: string): string {
  if (rel.endsWith('.html') || rel === 'sw.js') return 'no-cache'
  if (HASHED.test(rel)) return 'public, max-age=31536000, immutable'
  return 'public, max-age=3600'
}
