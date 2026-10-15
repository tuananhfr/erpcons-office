import { describe, expect, it } from 'vitest'
import { cacheControlFor, contentTypeFor, pickEncoding, resolveRequest } from './static-server.ts'

const dirs = new Set(['', 'van-ban', '_next'])
const isDirectory = (rel: string) => dirs.has(rel)

describe('resolveRequest', () => {
  it('serves index.html for directories with a trailing slash', () => {
    expect(resolveRequest('/', isDirectory)).toEqual({ kind: 'file', rel: 'index.html' })
    expect(resolveRequest('/van-ban/', isDirectory)).toEqual({ kind: 'file', rel: 'van-ban/index.html' })
  })

  it('redirects directories without a trailing slash, keeping the query', () => {
    expect(resolveRequest('/van-ban', isDirectory)).toEqual({ kind: 'redirect', location: '/van-ban/' })
    expect(resolveRequest('/van-ban?x=1', isDirectory)).toEqual({ kind: 'redirect', location: '/van-ban/?x=1' })
  })

  it('ignores the query for files', () => {
    expect(resolveRequest('/van-ban/a_bg.wasm?v=2', isDirectory)).toEqual({ kind: 'file', rel: 'van-ban/a_bg.wasm' })
  })

  it('rejects traversal, encoded or not', () => {
    expect(resolveRequest('/../secret', isDirectory)).toEqual({ kind: 'forbidden' })
    expect(resolveRequest('/van-ban/%2e%2e/%2e%2e/secret', isDirectory)).toEqual({ kind: 'forbidden' })
    expect(resolveRequest('/van-ban/..%5c..%5csecret', isDirectory)).toEqual({ kind: 'forbidden' })
  })

  it('rejects malformed escapes', () => {
    expect(resolveRequest('/%E0%A4%A', isDirectory)).toEqual({ kind: 'forbidden' })
  })

  it('rejects NUL bytes instead of letting fs throw', () => {
    expect(resolveRequest('/a%00b', isDirectory)).toEqual({ kind: 'forbidden' })
  })
})

describe('pickEncoding', () => {
  const both = { br: true, gzip: true }
  it('prefers brotli, then gzip', () => {
    expect(pickEncoding('gzip, deflate, br', both)).toBe('br')
    expect(pickEncoding('gzip', both)).toBe('gzip')
  })
  it('honours q=0 and missing variants', () => {
    expect(pickEncoding('br;q=0, gzip', both)).toBe('gzip')
    expect(pickEncoding('br', { br: false, gzip: true })).toBeNull()
  })
  it('handles absent header and wildcard', () => {
    expect(pickEncoding(undefined, both)).toBeNull()
    expect(pickEncoding('*', both)).toBe('br')
  })
})

describe('contentTypeFor', () => {
  it('maps engine and site files', () => {
    expect(contentTypeFor('van-ban/a_bg.wasm')).toBe('application/wasm')
    expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
    expect(contentTypeFor('van-ban/a.js')).toBe('text/javascript; charset=utf-8')
    expect(contentTypeFor('brand/erpcons-mark.svg')).toBe('image/svg+xml')
    expect(contentTypeFor('x.unknown')).toBe('application/octet-stream')
  })
})

describe('cacheControlFor', () => {
  it('never caches pages and the worker', () => {
    expect(cacheControlFor('van-ban/index.html')).toBe('no-cache')
    expect(cacheControlFor('sw.js')).toBe('no-cache')
  })
  it('caches hashed files for a year', () => {
    expect(cacheControlFor('van-ban/wordcraft-web-a4ceca68febdadee_bg.wasm')).toBe('public, max-age=31536000, immutable')
    expect(cacheControlFor('_next/static/chunks/main.js')).toBe('public, max-age=31536000, immutable')
  })
  it('caches other files briefly', () => {
    expect(cacheControlFor('brand/erpcons-mark.svg')).toBe('public, max-age=3600')
  })
})
