/** A random UUID v4. `crypto.randomUUID` exists only in secure contexts; getRandomValues works everywhere. */
export function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * One Idempotency-Key per create action. A retry of the same request reuses its key, so a create whose answer was
 * lost is not done twice; a changed body gets a new key, which the server would otherwise refuse
 * (IDEMPOTENCY_MISMATCH).
 */
export function createIdempotency(newKey: () => string = randomKey) {
  let last: { body: string; key: string } | null = null
  return {
    keyFor(body: unknown): string {
      const signature = JSON.stringify(body)
      if (!last || last.body !== signature) last = { body: signature, key: newKey() }
      return last.key
    },
    /** After a definite answer (success or a refusal) the next attempt is a new action. */
    reset() {
      last = null
    },
  }
}

export type Idempotency = ReturnType<typeof createIdempotency>
