import { describe, expect, it } from 'vitest'
import { embedHosts } from './embed.ts'

describe('embedHosts', () => {
  it('defaults to the production ERP and the local dev servers (3000 and 3001)', () => {
    const defaults = ['https://lpc.vn', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3001', 'http://127.0.0.1:3001']
    expect(embedHosts(undefined)).toEqual(defaults)
    expect(embedHosts('  ')).toEqual(defaults)
  })

  it('keeps only bare http(s) origins from the override', () => {
    expect(embedHosts('https://a.vn, http://b.local:8080 ,javascript:x,https://c.vn/path')).toEqual(['https://a.vn', 'http://b.local:8080'])
  })
})
