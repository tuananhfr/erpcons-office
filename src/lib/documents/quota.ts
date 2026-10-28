import { formatBytes } from './display.ts'
import type { Quota } from './types.ts'

export type QuotaLevel = 'ok' | 'near' | 'full'
const NEAR = 0.9

export function quotaLevel(quota: Quota): QuotaLevel {
  if (quota.limitBytes === 0 || quota.usedBytes >= quota.limitBytes) return 'full'
  return quota.usedBytes / quota.limitBytes >= NEAR ? 'near' : 'ok'
}

/** Share of the quota used, 0–100, for the meter. */
export function quotaPercent(quota: Quota): number {
  if (quota.limitBytes === 0) return 100
  return Math.min(100, Math.round((quota.usedBytes / quota.limitBytes) * 1000) / 10)
}

export function quotaSummary(quota: Quota): string {
  return `Đã dùng ${formatBytes(quota.usedBytes)} / ${formatBytes(quota.limitBytes)}`
}

export const QUOTA_NOTES: Readonly<Record<QuotaLevel, string | null>> = {
  ok: null,
  near: 'Sắp hết dung lượng lưu trữ online.',
  full: 'Đã hết dung lượng. Tài liệu mới và bản lưu mới sẽ không được nhận.',
}
