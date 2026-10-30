/**
 * Sign-up form rules. The server (erpcons-office-server `crates/signup/src/input.rs`) checks the same ones and has
 * the last word; here they only spare a round trip and say which field to fix.
 */
export const NAME_MAX_CHARS = 100
export const PASSWORD_MIN_CHARS = 8
// bcrypt reads only the first 72 bytes: a longer password would sign in with its prefix alone.
export const PASSWORD_MAX_BYTES = 72
const EMAIL_MAX_CHARS = 254
const EMAIL_LOCAL_MAX_CHARS = 64
const EMAIL_BAD_CHAR = /[\s\p{Cc}@,;<>()[\]\\"]/u

export type SignupField = 'name' | 'email' | 'password'

export interface SignupForm {
  name: string
  email: string
  password: string
}

export type FieldErrors = Partial<Record<SignupField, string>>

export const FIELD_ORDER: readonly SignupField[] = ['name', 'email', 'password']

const chars = (text: string) => [...text].length

export function normalizeName(raw: string): string {
  return raw.trim().normalize('NFC')
}

export function normalizeEmail(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase()
}

export function nameError(raw: string): string | null {
  const name = normalizeName(raw)
  if (!name) return 'Nhập họ tên của bạn.'
  if (chars(name) > NAME_MAX_CHARS) return `Họ tên dài tối đa ${NAME_MAX_CHARS} ký tự.`
  if (/\p{Cc}/u.test(name)) return 'Họ tên có ký tự không hợp lệ.'
  return null
}

export function emailError(raw: string): string | null {
  const email = normalizeEmail(raw)
  if (!email) return 'Nhập địa chỉ email.'
  const at = email.indexOf('@')
  const local = at < 0 ? '' : email.slice(0, at)
  const domain = at < 0 ? '' : email.slice(at + 1)
  const domainOk = domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !domain.includes('..')
  if (at < 0 || !local || !domainOk || chars(email) > EMAIL_MAX_CHARS || chars(local) > EMAIL_LOCAL_MAX_CHARS
    || EMAIL_BAD_CHAR.test(local) || EMAIL_BAD_CHAR.test(domain)) {
    return 'Email chưa đúng định dạng, ví dụ ten@congty.vn.'
  }
  // PI ID checks addresses with PHP's FILTER_VALIDATE_EMAIL, which refuses non-ASCII ones.
  if (!/^[\x20-\x7e]+$/.test(email)) return 'Email chỉ dùng chữ không dấu.'
  return null
}

export function passwordError(password: string, rawEmail: string): string | null {
  if (!password) return 'Nhập mật khẩu.'
  if (chars(password) < PASSWORD_MIN_CHARS) return `Mật khẩu cần ít nhất ${PASSWORD_MIN_CHARS} ký tự.`
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return 'Mật khẩu quá dài, hãy rút ngắn (tối đa khoảng 70 ký tự không dấu).'
  const email = normalizeEmail(rawEmail)
  if (email && password.trim().toLowerCase() === email) return 'Mật khẩu không được trùng với email.'
  return null
}

export function fieldError(field: SignupField, form: SignupForm): string | null {
  if (field === 'name') return nameError(form.name)
  if (field === 'email') return emailError(form.email)
  return passwordError(form.password, form.email)
}

export function validateSignup(form: SignupForm): FieldErrors {
  const errors: FieldErrors = {}
  for (const field of FIELD_ORDER) {
    const error = fieldError(field, form)
    if (error) errors[field] = error
  }
  return errors
}
