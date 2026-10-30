'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useIcon } from './IconsContext.tsx'
import { useDismiss } from './use-dismiss.ts'

export interface MenuItem {
  label: string
  icon: ReactNode
  onSelect: () => void
  danger?: boolean
}

/** The "⋮" menu of a row: arrow keys move between items, Escape closes and gives focus back to the button. */
export function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const more = useIcon('more')
  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  useDismiss(open, root, close)
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open])

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const entries = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
    const at = entries.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
      : (at + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length
    entries[next]?.focus()
  }

  return <div className="erp-docs-menu" ref={root}>
    <button ref={button} type="button" className="erp-docs-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open}
      aria-controls={open ? menuId : undefined} onClick={() => setOpen((value) => !value)}>{more}</button>
    {open && <div id={menuId} className="erp-docs-menu__list" role="menu" aria-label={label} onKeyDown={onKey}>
      {items.map((item) => <button key={item.label} type="button" role="menuitem" className="erp-docs-menu__item" data-danger={item.danger || undefined}
        onClick={() => { setOpen(false); item.onSelect() }}>
        {item.icon}<span>{item.label}</span>
      </button>)}
    </div>}
  </div>
}
