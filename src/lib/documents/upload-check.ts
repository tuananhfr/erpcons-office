import { INTAKE_LIMITS, extensionOf, matchesSignature } from '../files/intake-contract.ts'
import { formatBytes } from './display.ts'
import { ONLINE_FORMATS } from './formats.ts'
import type { Format, Quota } from './types.ts'

export type UploadRefusal =
  | { reason: 'unsupported' | 'empty' | 'signature' | 'tooMany'; message: string }
  | { reason: 'tooLarge' | 'quota'; message: string }

export const MAX_UPLOAD_FILES = INTAKE_LIMITS.maxFiles

const UNSUPPORTED = 'Chỉ lưu online được tệp DOCX, XLSX, PPTX và PDF.'
const EMPTY = 'Tệp đang trống.'
const SIGNATURE = 'Nội dung tệp không khớp với đuôi tệp. Tệp có thể bị hỏng hoặc bị đổi đuôi.'
export const TOO_MANY = `Mỗi lần tải lên tối đa ${MAX_UPLOAD_FILES} tệp. Hãy chọn các tệp còn lại ở lượt sau.`

export function onlineFormat(name: string): Format | null {
  const ext = extensionOf(name)
  return ONLINE_FORMATS.find((format) => format === ext) ?? null
}

/** The per-file limit: the site's intake limit, lowered to the server's when /me has answered. */
export function maxUploadBytes(quota: Quota | null): number {
  return quota && quota.maxFileBytes > 0 ? Math.min(INTAKE_LIMITS.maxFileBytes, quota.maxFileBytes) : INTAKE_LIMITS.maxFileBytes
}

/**
 * Client-side check of one file before it is sent (intake contract: formats, size, signature). The server checks
 * everything again; this only spares the user an upload that is bound to fail.
 */
export function checkUpload(name: string, size: number, head: Uint8Array, quota: Quota | null): UploadRefusal | null {
  const format = onlineFormat(name)
  if (!format) return { reason: 'unsupported', message: UNSUPPORTED }
  if (size === 0) return { reason: 'empty', message: EMPTY }
  const max = maxUploadBytes(quota)
  if (size > max) return { reason: 'tooLarge', message: `Tệp vượt quá ${formatBytes(max)}, giới hạn của mỗi tài liệu online.` }
  if (quota && quota.usedBytes + size > quota.limitBytes) {
    const free = Math.max(0, quota.limitBytes - quota.usedBytes)
    return { reason: 'quota', message: `Không đủ dung lượng: chỉ còn trống ${formatBytes(free)}.` }
  }
  return matchesSignature(format, head) ? null : { reason: 'signature', message: SIGNATURE }
}

export async function readHead(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, INTAKE_LIMITS.headBytes).arrayBuffer())
}
