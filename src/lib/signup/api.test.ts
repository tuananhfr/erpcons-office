import { describe, expect, it } from 'vitest'
import { signupStatus, submitSignup, verifySignup, type FetchLike } from './api.ts'

const FORM = { name: 'An', email: 'an@x.vn', password: '12345678', website: '' }

function answer(status: number, body?: unknown, headers: Record<string, string> = {}) {
  const calls: { input: string; init: RequestInit }[] = []
  const fetchImpl: FetchLike = async (input, init) => {
    calls.push({ input, init })
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers })
  }
  return { fetchImpl, calls }
}

const error = (code: string, extra: Record<string, unknown> = {}) =>
  ({ code, message_vi: `vi:${code}`, request_id: 'r', retryable: false, ...extra })

describe('submitSignup', () => {
  it('posts JSON without credentials and takes 202 as accepted', async () => {
    const { fetchImpl, calls } = answer(202, { accepted: true })
    expect(await submitSignup(FORM, fetchImpl)).toEqual({ kind: 'accepted' })
    expect(calls[0].input).toBe('/api/v1/signup')
    expect(calls[0].init.method).toBe('POST')
    expect(calls[0].init.credentials).toBe('omit')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(FORM)
    expect(new Headers(calls[0].init.headers).has('Authorization')).toBe(false)
  })

  it('maps every server answer', async () => {
    expect(await submitSignup(FORM, answer(422, error('INVALID_REQUEST', { field: 'email' })).fetchImpl))
      .toEqual({ kind: 'invalid', field: 'email', message: 'vi:INVALID_REQUEST' })
    expect(await submitSignup(FORM, answer(422, error('INVALID_REQUEST', { field: 'other' })).fetchImpl))
      .toMatchObject({ kind: 'invalid', field: null })
    expect(await submitSignup(FORM, answer(403, error('SIGNUP_CLOSED')).fetchImpl)).toEqual({ kind: 'closed', message: 'vi:SIGNUP_CLOSED' })
    expect(await submitSignup(FORM, answer(429, error('SIGNUP_DAILY_LIMIT')).fetchImpl))
      .toEqual({ kind: 'limited', message: 'vi:SIGNUP_DAILY_LIMIT', retryAfter: null })
    expect(await submitSignup(FORM, answer(429, error('RATE_LIMITED'), { 'Retry-After': '30' }).fetchImpl))
      .toEqual({ kind: 'limited', message: 'vi:RATE_LIMITED', retryAfter: 30 })
    expect(await submitSignup(FORM, answer(503, error('UNAVAILABLE')).fetchImpl)).toEqual({ kind: 'failed', message: 'vi:UNAVAILABLE' })
    expect(await submitSignup(FORM, answer(502, '<html>').fetchImpl)).toMatchObject({ kind: 'failed' })
    expect(await submitSignup(FORM, async () => { throw new TypeError('offline') })).toMatchObject({ kind: 'failed', message: expect.stringMatching(/mạng/) })
  })
})

describe('verifySignup', () => {
  it('sends the token in the body, never in the URL', async () => {
    const { fetchImpl, calls } = answer(200, { verified: true })
    const token = 'a'.repeat(43)
    expect(await verifySignup(token, fetchImpl)).toEqual({ kind: 'verified' })
    expect(calls[0].input).toBe('/api/v1/signup/verify')
    expect(calls[0].input).not.toContain(token)
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token })
  })

  it('tells a dead link from a retryable failure', async () => {
    expect(await verifySignup('t', answer(400, error('INVALID_TOKEN')).fetchImpl)).toEqual({ kind: 'invalidToken', message: 'vi:INVALID_TOKEN' })
    expect(await verifySignup('t', answer(422, error('INVALID_REQUEST')).fetchImpl)).toMatchObject({ kind: 'invalidToken' })
    expect(await verifySignup('t', answer(429, error('RATE_LIMITED')).fetchImpl)).toMatchObject({ kind: 'failed', retryable: true })
    expect(await verifySignup('t', answer(503, error('UNAVAILABLE')).fetchImpl)).toMatchObject({ kind: 'failed', retryable: true })
    expect(await verifySignup('t', async () => { throw new TypeError('offline') })).toMatchObject({ kind: 'failed', retryable: true })
  })
})

describe('signupStatus', () => {
  it('reads open or closed and treats anything else as unknown', async () => {
    expect(await signupStatus(answer(200, { open: true }).fetchImpl)).toBe('open')
    expect(await signupStatus(answer(200, { open: false }).fetchImpl)).toBe('closed')
    expect(await signupStatus(answer(200, { open: 'yes' }).fetchImpl)).toBe('unknown')
    expect(await signupStatus(answer(404).fetchImpl)).toBe('unknown')
    expect(await signupStatus(async () => { throw new TypeError('offline') })).toBe('unknown')
  })
})
