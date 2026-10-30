// Same rules as the server's `Name` (openapi.yaml): 1–255 characters after trimming, no control or bidi
// characters, no `/` or `\`. Checked here only to answer at once; the server still decides.
const MAX_CHARS = 255
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f/\\\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/

export type NameError = 'empty' | 'tooLong' | 'forbidden'

export const NAME_MESSAGES: Readonly<Record<NameError, string>> = {
  empty: 'Hãy nhập tên.',
  tooLong: `Tên dài tối đa ${MAX_CHARS} ký tự.`,
  forbidden: 'Tên không được chứa dấu / hoặc \\ và ký tự điều khiển.',
}

export function normalizeName(raw: string): string {
  return raw.trim().normalize('NFC')
}

export function nameError(raw: string): NameError | null {
  const name = normalizeName(raw)
  if (!name) return 'empty'
  if (Array.from(name).length > MAX_CHARS) return 'tooLong'
  return FORBIDDEN.test(name) ? 'forbidden' : null
}
