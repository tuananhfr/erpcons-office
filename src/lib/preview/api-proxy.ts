import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http'

/** Local preview only: `/api/` goes to this server (e.g. a local erpcons-office-server), as Apache does in production. */
export const API_PROXY_ENV = 'ERPCONS_API_PROXY'

// RFC 9110 §7.6.1 hop-by-hop fields, plus the client's Host (rewritten for the upstream).
const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host'])

/** The upstream origin, or null when the variable is unset. Throws on anything but a bare http(s) origin. */
export function apiProxyBase(value: string | undefined): URL | null {
  if (!value) return null
  const url = new URL(value)
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
    throw new Error(`${API_PROXY_ENV} must be a bare http(s) origin such as http://127.0.0.1:8080, got ${value}`)
  }
  return url
}

export function isApiRequest(rawUrl: string): boolean {
  const path = rawUrl.split('?')[0]
  return path === '/api' || path.startsWith('/api/')
}

/** Same path and query on the upstream; null if the request would leave it. */
export function upstreamUrl(base: URL, rawUrl: string): URL | null {
  if (!isApiRequest(rawUrl)) return null
  const url = new URL(rawUrl, base)
  return url.origin === base.origin ? url : null
}

export function forwardHeaders(headers: IncomingHttpHeaders, base: URL, clientHost: string | undefined): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name.toLowerCase())) out[name] = value
  }
  out.host = base.host
  if (clientHost) out['x-forwarded-host'] = clientHost
  out['x-forwarded-proto'] = 'http'
  return out
}

/** Response headers passed back to the browser, without hop-by-hop fields. */
export function backwardHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
  const out: OutgoingHttpHeaders = {}
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name.toLowerCase())) out[name] = value
  }
  return out
}
