'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { KINDS, type KindInfo } from '@/lib/documents/formats.ts'
import { useIcon } from './IconsContext.tsx'
import { useDismiss } from './use-dismiss.ts'

function KindChoice({ info, onPick }: { info: KindInfo; onPick: (info: KindInfo) => void }) {
  const icon = useIcon(info.format)
  return <button type="button" role="menuitem" className="erp-docs-menu__item erp-docs-new__item" data-format={info.format} onClick={() => onPick(info)}>
    <span className="erp-docs-new__icon">{icon}</span>
    <span><strong>{info.label}</strong><small>.{info.format}</small></span>
  </button>
}

/** "Tạo mới": the four kinds the server can create blank (openapi.yaml, `Kind`). */
export function NewDocumentMenu({ onPick }: { onPick: (info: KindInfo) => void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const create = useIcon('create')
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  useDismiss(open, root, close)
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])
  return <div className="erp-docs-menu erp-docs-new" ref={root}>
    <button ref={button} type="button" className="erp-btn erp-btn--primary" aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>{create}Tạo mới</button>
    {open && <div id={menuId} className="erp-docs-menu__list erp-docs-new__list" role="menu" aria-label="Tạo tài liệu mới">
      {KINDS.map((info) => <KindChoice key={info.kind} info={info} onPick={(picked) => { setOpen(false); onPick(picked) }} />)}
    </div>}
  </div>
}
