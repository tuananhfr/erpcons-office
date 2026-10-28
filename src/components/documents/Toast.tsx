'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIcon } from './IconsContext.tsx'

export interface ToastMessage {
  text: string
  tone: 'done' | 'error'
  action?: { label: string; run: () => void }
}

const SHOW_MS = 7000

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const show = useCallback((message: ToastMessage) => setToast(message), [])
  const hide = useCallback(() => setToast(null), [])
  return { toast, show, hide }
}

/** One message at a time in a live region that is always in the DOM, so screen readers announce each one. */
export function Toast({ toast, onHide }: { toast: ToastMessage | null; onHide: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = useIcon('done')
  const warning = useIcon('warning')
  const close = useIcon('close')
  useEffect(() => {
    if (!toast) return
    timer.current = setTimeout(onHide, SHOW_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [toast, onHide])
  return <div className="erp-docs-toast-region" role="status" aria-live="polite">
    {toast && <div className="erp-docs-toast" data-tone={toast.tone}>
      <span className="erp-docs-toast__icon">{toast.tone === 'done' ? done : warning}</span>
      <p className="erp-docs-toast__text">{toast.text}</p>
      {toast.action && <button type="button" className="erp-docs-toast__action" onClick={() => { toast.action?.run(); onHide() }}>{toast.action.label}</button>}
      <button type="button" className="erp-docs-icon-btn erp-docs-toast__close" aria-label="Đóng thông báo" onClick={onHide}>{close}</button>
    </div>}
  </div>
}
