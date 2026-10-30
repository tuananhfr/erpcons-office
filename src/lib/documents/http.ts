import { problem, problemFromError, problemFromResponse } from './problem.ts'
import type { ApiFetch, Result } from './types.ts'

const BASE = '/api/v1'
// Anything the page cannot read is treated like a hiccup of the server, never as data.
export const MALFORMED = problem('failed', null, true)
export const JSON_HEADERS = { Accept: 'application/json', 'Content-Type': 'application/json' }
export const GET: RequestInit = { method: 'GET', headers: { Accept: 'application/json' } }

export type Raw = Record<string, unknown>
export const isRaw = (value: unknown): value is Raw => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
export const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
export const count = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null)
export const segment = (id: string) => encodeURIComponent(id)

/** A JSON request body; `key` adds the Idempotency-Key of creates. */
export const send = (method: string, body?: unknown, key?: string): RequestInit => ({
  method,
  headers: key ? { ...JSON_HEADERS, 'Idempotency-Key': key } : JSON_HEADERS,
  body: body === undefined ? undefined : JSON.stringify(body),
})

/** The answer of one call: `read` gets the parsed JSON body (null for 204) and the response, for its headers. */
export type Reader<T> = (body: unknown, response: Response) => T | null

/** Every Office API call of the page goes through `apiFetch` (token attached, same-origin `/api/v1/` only). */
export function createCaller(apiFetch: ApiFetch) {
  return async function call<T>(path: string, init: RequestInit, read: Reader<T>): Promise<Result<T>> {
    let response: Response
    try {
      response = await apiFetch(`${BASE}${path}`, init)
    } catch (error) {
      return { ok: false, problem: problemFromError(error) }
    }
    if (!response.ok) return { ok: false, problem: await problemFromResponse(response) }
    let body: unknown = null
    if (response.status !== 204) {
      try {
        const raw = await response.text()
        body = raw ? JSON.parse(raw) : null
      } catch {
        return { ok: false, problem: MALFORMED }
      }
    }
    const value = read(body, response)
    return value === null ? { ok: false, problem: MALFORMED } : { ok: true, value }
  }
}

export type Caller = ReturnType<typeof createCaller>

/** Bytes instead of JSON (a version's file). */
export async function fetchBytes(apiFetch: ApiFetch, path: string): Promise<Result<Blob>> {
  let response: Response
  try {
    response = await apiFetch(`${BASE}${path}`, { method: 'GET', headers: { Accept: 'application/octet-stream' } })
  } catch (error) {
    return { ok: false, problem: problemFromError(error) }
  }
  if (!response.ok) return { ok: false, problem: await problemFromResponse(response) }
  try {
    return { ok: true, value: await response.blob() }
  } catch {
    return { ok: false, problem: problem('offline') }
  }
}
