// The server issues 32 random bytes in base64url (43 characters); anything else is not one of its tokens.
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export type TakenToken = { kind: 'token'; token: string } | { kind: 'missing' } | { kind: 'malformed' }

/**
 * Reads `#token=` from the verification link and removes the fragment from the address bar at once, so the token
 * stays out of history, bookmarks and screenshots. The caller keeps it in memory only.
 */
export function takeVerificationToken(
  location: Pick<Location, 'hash' | 'pathname' | 'search'>,
  history: Pick<History, 'replaceState' | 'state'>,
): TakenToken {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash
  if (!hash) return { kind: 'missing' }
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
  const token = new URLSearchParams(hash).get('token')
  if (token === null || token === '') return { kind: 'missing' }
  return TOKEN.test(token) ? { kind: 'token', token } : { kind: 'malformed' }
}
