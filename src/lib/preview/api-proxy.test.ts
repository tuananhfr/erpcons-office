import { describe, expect, it } from 'vitest'
import { apiProxyBase, backwardHeaders, forwardHeaders, isApiRequest, upstreamUrl } from './api-proxy.ts'

describe('preview /api/ proxy', () => {
  it('is off without the variable and takes a bare http(s) origin only', () => {
    expect(apiProxyBase(undefined)).toBeNull()
    expect(apiProxyBase('')).toBeNull()
    expect(apiProxyBase('http://127.0.0.1:8080')?.origin).toBe('http://127.0.0.1:8080')
    for (const bad of ['ftp://x', 'http://127.0.0.1:8080/api', 'http://h?x=1', 'http://u:p@h', 'not a url']) expect(() => apiProxyBase(bad)).toThrow()
  })

  it('forwards /api/ paths with their query and nothing else', () => {
    const base = apiProxyBase('http://127.0.0.1:8080')!
    expect(isApiRequest('/api/v1/documents?cursor=a')).toBe(true)
    expect(isApiRequest('/api')).toBe(true)
    expect(isApiRequest('/apiary/')).toBe(false)
    expect(isApiRequest('/van-ban/?doc=1')).toBe(false)
    expect(upstreamUrl(base, '/api/v1/documents/x/content?a=1')?.href).toBe('http://127.0.0.1:8080/api/v1/documents/x/content?a=1')
    expect(upstreamUrl(base, '/van-ban/')).toBeNull()
  })

  it('rewrites Host, drops hop-by-hop fields and keeps the rest (Authorization, If-Match)', () => {
    const base = apiProxyBase('http://127.0.0.1:8080')!
    const headers = forwardHeaders({ host: 'localhost:3011', connection: 'keep-alive', authorization: 'Bearer t', 'if-match': '"e"', te: 'trailers' }, base, 'localhost:3011')
    expect(headers).toEqual({ host: '127.0.0.1:8080', authorization: 'Bearer t', 'if-match': '"e"', 'x-forwarded-host': 'localhost:3011', 'x-forwarded-proto': 'http' })
    expect(backwardHeaders({ etag: '"e2"', 'transfer-encoding': 'chunked', 'x-document-version': '2' })).toEqual({ etag: '"e2"', 'x-document-version': '2' })
  })
})
