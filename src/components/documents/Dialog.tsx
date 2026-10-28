'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { useIcon } from './IconsContext.tsx'

/** A modal `<dialog>`: the browser traps focus and handles Escape; focus goes back to the opener on close. */
export function Dialog({ title, describedBy, onClose, children }: { title: string; describedBy?: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const close = useIcon('close')
  useEffect(() => {
    const dialog = ref.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (dialog && !dialog.open) {
      dialog.showModal()
      // React's autoFocus fires while the dialog is still closed; showModal then picks the first control (the close button).
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    return () => {
      dialog?.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])
  return <dialog ref={ref} className="erp-docs-dialog" aria-labelledby={titleId} aria-describedby={describedBy}
    onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="erp-docs-dialog__head">
      <h2 id={titleId}>{title}</h2>
      <button type="button" className="erp-docs-icon-btn" aria-label="Đóng" onClick={onClose}>{close}</button>
    </div>
    {children}
  </dialog>
}
