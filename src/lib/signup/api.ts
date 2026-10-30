import type { SignupField, SignupForm } from './rules.ts'

/**
 * Calls of the sign-up pages (`/api/v1/signup`, docs/openapi.yaml of erpcons-office-server). They need no sign-in, so
 * they use plain same-origin `fetch` and never `erpAccount.apiFetch`, which would attach the visitor's PI token.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type SignupResult =
  | { kind: 'accepted' }
  | { kind: 'invalid'; field: SignupField | null; message: string }
  | { kind: 'closed'; message: string }
  /** Too many tries from this device, or the whole service is past its daily sign-ups. */
  | { kind: 'limited'; message: string; retryAfter: number | null }
  | { kind: 'failed'; message: string }

export type VerifyResult =
  | { kind: 'verified' }
  | { kind: 'invalidToken'; message: string }
  | { kind: 'failed'; message: string; retryable: boolean }

export type SignupStatus = 'open' | 'closed' | 'unknown'

const BASE = '/api/v1/signup'
const OFFLINE = 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.'
const SERVER_DOWN = 'Máy chủ đang tạm thời gián đoạn. Vui lòng thử lại sau.'
const DAILY_LIMIT = 'Hôm nay đã nhận đủ số đăng ký. Vui lòng thử lại vào ngày mai.'
const FIELDS: readonly SignupField[] = ['name', 'email', 'password']

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  credentials: 'omit',
  cache: 'no-store',
})

interface ApiError { code: string | null; message: string | null; field: SignupField | null }

async function readError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object') return { code: null, message: null, field: null }
    const raw = body as Record<string, unknown>
    const field = FIELDS.find((name) => name === raw.field) ?? null
    return {
      code: typeof raw.code === 'string' ? raw.code : null,
      message: typeof raw.message_vi === 'string' && raw.message_vi ? raw.message_vi : null,
      field,
    }
  } catch {
    return { code: null, message: null, field: null }
  }
}

function retryAfter(response: Response): number | null {
  const seconds = Number(response.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

export async function signupStatus(fetchImpl: FetchLike = fetch): Promise<SignupStatus> {
  try {
    const response = await fetchImpl(BASE, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store' })
    if (!response.ok) return 'unknown'
    const body: unknown = await response.json()
    if (body && typeof body === 'object' && typeof (body as { open?: unknown }).open === 'boolean') {
      return (body as { open: boolean }).open ? 'open' : 'closed'
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}

/** `website` is the hidden field only bots fill; the server answers them like anyone else and does nothing. */
export async function submitSignup(form: SignupForm & { website: string }, fetchImpl: FetchLike = fetch): Promise<SignupResult> {
  let response: Response
  try {
    response = await fetchImpl(BASE, post({ name: form.name, email: form.email, password: form.password, website: form.website }))
  } catch {
    return { kind: 'failed', message: OFFLINE }
  }
  if (response.status === 202) return { kind: 'accepted' }
  const error = await readError(response)
  if (response.status === 422 || response.status === 400) {
    return { kind: 'invalid', field: error.field, message: error.message ?? 'Thông tin chưa hợp lệ.' }
  }
  if (error.code === 'SIGNUP_CLOSED') return { kind: 'closed', message: error.message ?? 'ERPCons Văn phòng chưa mở đăng ký tài khoản mới.' }
  if (error.code === 'SIGNUP_DAILY_LIMIT') return { kind: 'limited', message: error.message ?? DAILY_LIMIT, retryAfter: null }
  if (response.status === 429) {
    return { kind: 'limited', message: error.message ?? 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.', retryAfter: retryAfter(response) }
  }
  return { kind: 'failed', message: error.message ?? SERVER_DOWN }
}

export async function verifySignup(token: string, fetchImpl: FetchLike = fetch): Promise<VerifyResult> {
  let response: Response
  try {
    response = await fetchImpl(`${BASE}/verify`, post({ token }))
  } catch {
    return { kind: 'failed', message: OFFLINE, retryable: true }
  }
  if (response.ok) return { kind: 'verified' }
  const error = await readError(response)
  // A 422 is a token the server could not even read: as dead as an expired one.
  if (error.code === 'INVALID_TOKEN' || response.status === 400 || response.status === 422) {
    return { kind: 'invalidToken', message: error.message ?? 'Liên kết xác minh không đúng, đã được dùng hoặc đã hết hạn.' }
  }
  if (response.status === 429) return { kind: 'failed', message: error.message ?? 'Bạn thao tác quá nhanh. Vui lòng thử lại sau giây lát.', retryable: true }
  return { kind: 'failed', message: error.message ?? SERVER_DOWN, retryable: true }
}
