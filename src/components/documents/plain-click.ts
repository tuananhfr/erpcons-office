import type { MouseEvent } from 'react'

/** A left click without modifiers; the others keep the link's own behaviour (new tab, new window). */
export function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
