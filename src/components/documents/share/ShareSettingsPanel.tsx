'use client'

import { useState } from 'react'
import type { Problem, ShareSettings } from '@/lib/documents/types.ts'

const SWITCHES: readonly { key: keyof ShareSettings; label: string; hint: string }[] = [
  { key: 'editorsCanShare', label: 'Người chỉnh sửa có thể thay đổi quyền và chia sẻ', hint: 'Tắt thì chỉ bạn thêm, xoá người và bật, tắt đường liên kết.' },
  { key: 'viewersCanDownload', label: 'Người xem và người nhận xét có thể tải xuống, in và sao chép', hint: 'Áp dụng cả cho người mở bằng đường liên kết.' },
]

/** The gear of the share dialog (owner only): two switches, each saved as soon as it is flipped. */
export function ShareSettingsPanel({ settings, busy, onSave, onBack }: {
  settings: ShareSettings
  busy: boolean
  onSave: (settings: ShareSettings) => Promise<Problem | null>
  onBack: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  return <div className="erp-docs-dialog__body erp-share-settings">
    <ul className="erp-share-settings__list">
      {SWITCHES.map((item) => <li key={item.key}>
        <label className="erp-share-switch">
          <input type="checkbox" role="switch" checked={settings[item.key]} disabled={busy}
            onChange={async (event) => {
              setError(null)
              const problem = await onSave({ ...settings, [item.key]: event.target.checked })
              if (problem) setError(problem.message)
            }} />
          <span className="erp-share-switch__track" aria-hidden="true" />
          <span className="erp-share-switch__text">
            <span className="erp-share-switch__label">{item.label}</span>
            <span className="erp-share-switch__hint">{item.hint}</span>
          </span>
        </label>
      </li>)}
    </ul>
    <p className="erp-docs-field__error" role="alert">{error}</p>
    <div className="erp-docs-dialog__actions">
      <button type="button" className="erp-btn erp-btn--primary" onClick={onBack}>Xong</button>
    </div>
  </div>
}
