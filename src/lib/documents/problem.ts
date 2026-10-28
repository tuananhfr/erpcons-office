import type { Problem, ProblemKind } from './types.ts'

export const MESSAGES: Readonly<Record<ProblemKind, string>> = {
  // One sentence for every 404: the API never says whether the item exists (§08).
  notFound: 'Không tìm thấy tài liệu hoặc bạn không có quyền mở',
  signIn: 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.',
  offline: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  nameTaken: 'Đã có thư mục trùng tên ở vị trí này. Hãy chọn tên khác.',
  quota: 'Không đủ dung lượng lưu trữ online cho thao tác này.',
  tooLarge: 'Tệp vượt quá kích thước cho phép của mỗi tài liệu.',
  cycle: 'Không thể chuyển thư mục vào chính nó hoặc thư mục con của nó.',
  unsupported: 'Máy chủ không nhận tệp này: định dạng chưa được hỗ trợ hoặc nội dung không khớp với đuôi tệp.',
  invalid: 'Yêu cầu không hợp lệ. Hãy kiểm tra lại tên rồi thử lại.',
  busy: 'Máy chủ đang bận. Hãy thử lại sau giây lát.',
  failed: 'Không thực hiện được thao tác. Hãy thử lại.',
}

const RETRYABLE: ReadonlySet<ProblemKind> = new Set(['offline', 'busy'])

export function problem(kind: ProblemKind, retryAfter: number | null = null, retryable = RETRYABLE.has(kind)): Problem {
  return { kind, message: MESSAGES[kind], retryable, retryAfter }
}

function retryAfterOf(response: Response): number | null {
  const value = response.headers.get('Retry-After')
  return value !== null && /^\d+$/.test(value.trim()) ? Number.parseInt(value, 10) : null
}

async function codeOf(response: Response): Promise<{ code: string | null; retryable: boolean | null }> {
  try {
    const body: unknown = JSON.parse(await response.text())
    if (!body || typeof body !== 'object') return { code: null, retryable: null }
    const { code, retryable } = body as { code?: unknown; retryable?: unknown }
    return { code: typeof code === 'string' ? code : null, retryable: typeof retryable === 'boolean' ? retryable : null }
  } catch {
    return { code: null, retryable: null }
  }
}

/** A non-2xx answer. Branches on status and `code` only; `message_vi` is not shown so wording stays consistent. */
export async function problemFromResponse(response: Response): Promise<Problem> {
  const status = response.status
  if (status === 404) return problem('notFound')
  const { code, retryable } = await codeOf(response)
  if (status === 409 && code === 'NAME_TAKEN') return problem('nameTaken')
  if (status === 413) return problem(code === 'QUOTA_EXCEEDED' ? 'quota' : 'tooLarge')
  if (status === 422) {
    if (code === 'FOLDER_CYCLE') return problem('cycle')
    if (code === 'UNSUPPORTED_TYPE' || code === 'INVALID_SIGNATURE') return problem('unsupported')
    // A key reused with another body: the caller drops the key, so trying again is safe.
    if (code === 'IDEMPOTENCY_MISMATCH') return problem('failed', null, true)
    return problem('invalid')
  }
  if (status === 401) return problem('signIn')
  if (status === 429 || status === 503) return problem('busy', retryAfterOf(response))
  // A 502/504 from the reverse proxy means the server is unreachable.
  if (status >= 500) return retryable === false ? problem('failed') : problem('offline', retryAfterOf(response))
  return problem('failed', null, retryable === true)
}

const SIGN_IN_CODES = new Set(['unauthenticated', 'signed_out', 'session_expired', 'insufficient_scope'])

/** A rejection of `erpAccount.apiFetch`; a refused path is a programming error and is rethrown. */
export function problemFromError(error: unknown): Problem {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null
  if (code === 'invalid_api_path') throw error
  if (code === 'network') return problem('offline')
  if (typeof code === 'string' && SIGN_IN_CODES.has(code)) return problem('signIn')
  if (code === 'rate_limited' || code === 'dependency_unavailable') return problem('busy')
  return problem('failed', null, true)
}
