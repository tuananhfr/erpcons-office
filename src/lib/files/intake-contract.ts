import { EDITORS, type EditorSlug } from '../../config/editors.ts'

// File intake contract (spec V3 §03), shared by the landing picker, the /nhan-tep/ page, editor-shell/intake.js and
// sw.js. The shell scripts get it serialised (intakeContractScript), so every limit and message has one source here.

export const INTAKE_DB = 'erpcons-file-transfer-v1'
export const INTAKE_STORE = 'pending'

/** OPENED and PARSER_FAILED only come from editors that report back through window.erpIntakeResult. */
export const INTAKE_STATES = [
  'RECEIVED', 'VALIDATING', 'READY', 'ROUTED', 'DELIVERED', 'OPENED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED', 'EXPIRED',
] as const
export type IntakeState = typeof INTAKE_STATES[number]

export type IntakeError =
  | 'UNSUPPORTED_TYPE' | 'INVALID_SIGNATURE' | 'TOO_LARGE' | 'NO_SPACE' | 'QUOTA_EXCEEDED' | 'SOURCE_UNAVAILABLE'
  | 'PERMISSION_EXPIRED' | 'PARSER_FAILED' | 'OFFLINE_DEPENDENCY' | 'ACCESS_DENIED' | 'USER_CANCELLED'

export type SourceMode = 'SHARE_IN' | 'OPEN_WITH' | 'PICKER'

export const INTAKE_LIMITS = {
  maxFiles: 5,
  maxFileBytes: 100 * 1024 * 1024,
  maxBatchBytes: 200 * 1024 * 1024,
  ttlMs: 60 * 60 * 1000,
  headBytes: 1024,
  // Longer than open-file.js waits for the canvas (2 min), so only a tab that died mid-handoff loses its claim.
  claimMs: 150 * 1000,
} as const

// Several reasons share a code: support staff read the code, users read the sentence.
const REASONS = {
  unsupported: ['UNSUPPORTED_TYPE', 'Văn phòng chưa mở được loại tệp này. Hãy chọn tệp văn bản, bảng tính, trình chiếu hoặc PDF.'],
  empty: ['INVALID_SIGNATURE', 'Tệp đang trống.'],
  signature: ['INVALID_SIGNATURE', 'Nội dung tệp không khớp với đuôi tệp. Tệp có thể bị hỏng hoặc bị đổi đuôi.'],
  encryptedPresentation: ['UNSUPPORTED_TYPE', 'Văn phòng chưa mở được bản trình chiếu đặt mật khẩu hoặc tệp PPT cũ bị đổi đuôi. Hãy gỡ mật khẩu hoặc lưu lại thành PPTX bằng PowerPoint.'],
  tooLarge: ['TOO_LARGE', 'Tệp vượt quá 100 MB. Hãy mở trực tiếp từ menu Tệp của công cụ.'],
  batchTooLarge: ['QUOTA_EXCEEDED', 'Tổng dung lượng vượt quá 200 MB cho một lần chia sẻ. Hãy chia sẻ tệp này ở lượt sau.'],
  tooMany: ['QUOTA_EXCEEDED', 'Mỗi lần chỉ nhận tối đa 5 tệp. Hãy chia sẻ tệp này ở lượt sau.'],
  noSpace: ['NO_SPACE', 'Không lưu tạm được tệp trên thiết bị. Kiểm tra bộ nhớ hoặc quyền lưu trữ của trình duyệt.'],
  quota: ['QUOTA_EXCEEDED', 'Không đủ bộ nhớ để chuẩn bị tệp. Bạn có thể mở trực tiếp trong công cụ.'],
  unreadableShare: ['SOURCE_UNAVAILABLE', 'Không đọc được tệp được chia sẻ. Ứng dụng nguồn có thể đã đóng; hãy chia sẻ lại.'],
  unreadableFile: ['SOURCE_UNAVAILABLE', 'Không đọc được tệp đã chọn. Hãy mở tệp từ menu Tệp của công cụ.'],
  storageDenied: ['SOURCE_UNAVAILABLE', 'Trình duyệt không cho phép lưu trữ tệp tạm. Hãy mở từ menu Tệp.'],
  storageBusy: ['SOURCE_UNAVAILABLE', 'Bộ nhớ tạm đang bận. Đóng các tab công cụ khác rồi thử lại.'],
  storageError: ['SOURCE_UNAVAILABLE', 'Không truy cập được tệp tạm. Hãy mở tệp từ menu Tệp của công cụ.'],
  deliverFailed: ['SOURCE_UNAVAILABLE', 'Không chuyển được tệp. Hãy mở tệp từ menu Tệp của công cụ.'],
  expired: ['PERMISSION_EXPIRED', 'Tệp tạm đã hết hạn hoặc đã được dọn. Hãy chọn hoặc chia sẻ lại tệp.'],
  wrongEditor: ['ACCESS_DENIED', 'Tệp tạm không dành cho công cụ này.'],
  crossSite: ['ACCESS_DENIED', 'Chỉ nhận tệp được chia sẻ từ thiết bị của bạn.'],
  notReady: ['OFFLINE_DEPENDENCY', 'Công cụ chưa sẵn sàng. Tải lại trang để thử lại hoặc mở tệp từ menu Tệp.'],
  parserFailed: ['PARSER_FAILED', 'Công cụ không mở được tệp này: tệp hỏng, định dạng không hỗ trợ hoặc đã mở quá nhiều tệp.'],
  cancelled: ['USER_CANCELLED', 'Đã hủy.'],
} as const satisfies Record<string, readonly [IntakeError, string]>

export type IntakeReason = keyof typeof REASONS

export function intakeCode(reason: IntakeReason): IntakeError {
  return REASONS[reason][0]
}

/** The user-facing sentence, ending with the short code support staff look up. */
export function intakeMessage(reason: IntakeReason): string {
  return `${REASONS[reason][1]} (Mã: ${REASONS[reason][0]})`
}

/** Shown instead of a file when the source app (Zalo, a browser…) shared only a link or text. */
export const LINK_ONLY_MESSAGE = 'Ứng dụng nguồn chỉ gửi liên kết, không gửi tệp. Hãy tải tệp về máy (Zalo: giữ tệp → Lưu về máy), rồi chia sẻ lại chính tệp đó hoặc mở từ trang Văn phòng.'

// Magic numbers per container; `within` is how far into the first KB the marker may start (PDF allows a preamble).
const SIGNATURES = {
  zip: { magic: [0x50, 0x4b, 0x03, 0x04], within: 0 },
  ole: { magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], within: 0 },
  rtf: { magic: [0x7b, 0x5c, 0x72, 0x74, 0x66], within: 0 },
  pdf: { magic: [0x25, 0x50, 0x44, 0x46, 0x2d], within: INTAKE_LIMITS.headBytes - 5 },
} as const
type Signature = keyof typeof SIGNATURES

// What each engine opens by content: WordCraft reads an RTF or a .docx saved as .doc and the reverse, password-protected
// OOXML (Word, Excel) is an OLE file. DeckCraft has no OLE reader, so a .pptx must be a zip.
const WORD: readonly Signature[] = ['zip', 'ole', 'rtf']
const SHEET: readonly Signature[] = ['zip', 'ole']
export const SIGNATURE_RULES: Readonly<Record<string, readonly Signature[]>> = {
  docx: WORD, docm: WORD, dotx: WORD, dotm: WORD, doc: WORD, dot: WORD, rtf: WORD, odt: ['zip'],
  xlsx: SHEET, xlsm: SHEET, xlsb: SHEET, xls: SHEET, ods: ['zip'],
  pptx: ['zip'], pptm: ['zip'], potx: ['zip'], ppsx: ['zip'],
  pdf: ['pdf'],
}
/** Plain-text formats have no signature to check. */
export const UNCHECKED_FORMATS: readonly string[] = ['txt', 'md', 'csv', 'tsv']

export const INTAKE_ROUTES: Readonly<Record<string, EditorSlug>> = Object.fromEntries(
  EDITORS.flatMap((editor) => editor.accepts.map((ext) => [ext, editor.slug] as const)),
)
export const ACCEPTED_EXTENSIONS: readonly string[] = EDITORS.flatMap((editor) => editor.accepts)

export function extensionOf(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? (parts.pop() ?? '').toLowerCase() : ''
}

export function editorForName(name: string): EditorSlug | undefined {
  const ext = extensionOf(name)
  return Object.hasOwn(INTAKE_ROUTES, ext) ? INTAKE_ROUTES[ext] : undefined
}

function hasSignature(kind: Signature, head: Uint8Array): boolean {
  const { magic, within } = SIGNATURES[kind]
  for (let start = 0; start <= within && start + magic.length <= head.length; start++) {
    if (magic.every((byte, i) => head[start + i] === byte)) return true
  }
  return false
}

/** Whether the first KB of a file fits its extension (anti MIME/extension spoofing). */
export function matchesSignature(ext: string, head: Uint8Array): boolean {
  const kinds = SIGNATURE_RULES[ext]
  if (!kinds) return UNCHECKED_FORMATS.includes(ext)
  return kinds.some((kind) => hasSignature(kind, head))
}

// A password-protected PPTX is an OLE file, as is a legacy PPT renamed; DeckCraft opens neither, and saying why
// beats the generic "content does not match" message.
export const OLE_REFUSED_FORMATS: readonly string[] = Object.keys(SIGNATURE_RULES).filter((ext) => INTAKE_ROUTES[ext] === 'trinh-chieu')

export function signatureFailure(ext: string, head: Uint8Array): IntakeReason | null {
  if (matchesSignature(ext, head)) return null
  return OLE_REFUSED_FORMATS.includes(ext) && hasSignature('ole', head) ? 'encryptedPresentation' : 'signature'
}

// Bidi overrides can show "\u202efdp.exe" as "exe.pdf"; only displayed names are cleaned, editors get the real one.
const BIDI_CONTROLS = /[\u202a-\u202e\u2066-\u2069]/g
export function displayName(name: string): string {
  return name.replace(BIDI_CONTROLS, '')
}

export interface IntakeRecord {
  id: string
  name: string
  expiresAt: number
  /** Present until the editor reports a result (or forever for an old editor build); never on rejected entries. */
  file?: Blob
  editor?: EditorSlug
  batchId?: string
  /** Order within a shared batch. */
  position?: number
  sourceMode?: SourceMode
  claimedMime?: string
  size?: number
  state?: IntakeState
  errorCode?: IntakeError | null
  reason?: IntakeReason | null
  recoverable?: boolean
  createdAt?: number
}

/** The contract as plain data for the ES5 shell scripts (page and service worker). */
export function intakeContract() {
  return {
    version: 1,
    db: INTAKE_DB,
    store: INTAKE_STORE,
    limits: INTAKE_LIMITS,
    states: INTAKE_STATES,
    routes: INTAKE_ROUTES,
    signatures: SIGNATURES,
    rules: SIGNATURE_RULES,
    unchecked: UNCHECKED_FORMATS,
    oleRefused: OLE_REFUSED_FORMATS,
    messages: Object.fromEntries((Object.keys(REASONS) as IntakeReason[]).map((reason) => [reason, { code: intakeCode(reason), text: intakeMessage(reason) }])),
    linkOnly: LINK_ONLY_MESSAGE,
  }
}

export function intakeContractScript(global: 'window' | 'self'): string {
  return `${global}.erpIntakeContract=${JSON.stringify(intakeContract())}`
}
