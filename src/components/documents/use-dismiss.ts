'use client'

import { useEffect, type RefObject } from 'react'

/** Closes a popup on Escape or a pointer press outside `root`. */
export function useDismiss(open: boolean, root: RefObject<HTMLElement | null>, close: (refocus: boolean) => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(true) }
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(false) }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, root, close])
}
