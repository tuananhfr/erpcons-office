'use client'

import { QUOTA_NOTES, quotaLevel, quotaPercent, quotaSummary } from '@/lib/documents/quota.ts'
import type { Quota } from '@/lib/documents/types.ts'

export function QuotaMeter({ quota }: { quota: Quota | null }) {
  if (!quota) return <div className="erp-docs-quota" aria-hidden="true" />
  const level = quotaLevel(quota)
  const percent = quotaPercent(quota)
  const summary = quotaSummary(quota)
  const note = QUOTA_NOTES[level]
  return <div className="erp-docs-quota" data-level={level}>
    <p className="erp-docs-quota__text">{summary}</p>
    <div className="erp-docs-quota__bar" role="meter" aria-label="Dung lượng lưu trữ online" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={percent} aria-valuetext={summary}>
      <span style={{ width: `${percent}%` }} />
    </div>
    {note && <p className="erp-docs-quota__note">{note}</p>}
  </div>
}
