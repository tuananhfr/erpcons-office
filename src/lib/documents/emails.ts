/** Email addresses typed into the share dialog, checked as the server's `Email` schema does before anything is sent. */

const MAX_LENGTH = 254
export const MAX_RECIPIENTS = 50

/** One `@` with a non-empty part on each side and a dot in the domain; no spaces or control characters. */
export function isEmail(value: string): boolean {
  if (value.length < 3 || value.length > MAX_LENGTH) return false
  if (/[\s\u0000-\u001f\u007f]/.test(value)) return false
  const at = value.indexOf('@')
  if (at <= 0 || at !== value.lastIndexOf('@')) return false
  const domain = value.slice(at + 1)
  const dot = domain.indexOf('.')
  return domain.length > 0 && dot > 0 && dot < domain.length - 1
}

/** Comparable form: the server trims, NFC-normalizes and lowercases. */
export const normalizeEmail = (value: string) => value.trim().normalize('NFC').toLowerCase()

/** Splits pasted or typed text at commas, semicolons, spaces and line breaks; drops repeats. */
export function splitEmails(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []
  for (const part of input.split(/[\s,;]+/)) {
    const value = normalizeEmail(part.replace(/^<|>$/g, ''))
    if (!value) continue
    const bucket = isEmail(value) ? valid : invalid
    if (!bucket.includes(value)) bucket.push(value)
  }
  return { valid, invalid }
}
