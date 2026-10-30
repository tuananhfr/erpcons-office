import { describe, expect, it } from 'vitest'
import { takeVerificationToken } from './token.ts'

function page(hash: string) {
  const replaced: string[] = []
  const history = { state: null, replaceState: (_data: unknown, _unused: string, url?: string | URL | null) => { replaced.push(String(url)) } }
  return { location: { hash, pathname: '/dang-ky/xac-minh/', search: '' }, history, replaced }
}

describe('takeVerificationToken', () => {
  const token = 'Ab-_'.repeat(10) + 'xyz'

  it('returns the token and strips the fragment from the address bar', () => {
    const { location, history, replaced } = page(`#token=${token}`)
    expect(takeVerificationToken(location, history)).toEqual({ kind: 'token', token })
    expect(replaced).toEqual(['/dang-ky/xac-minh/'])
  })

  it('reports a missing or malformed token, and still strips the fragment', () => {
    const missing = page('')
    expect(takeVerificationToken(missing.location, missing.history)).toEqual({ kind: 'missing' })
    expect(missing.replaced).toEqual([])
    const other = page('#x=1')
    expect(takeVerificationToken(other.location, other.history)).toEqual({ kind: 'missing' })
    expect(other.replaced).toHaveLength(1)
    const short = page('#token=abc')
    expect(takeVerificationToken(short.location, short.history)).toEqual({ kind: 'malformed' })
    expect(short.replaced).toHaveLength(1)
  })
})
