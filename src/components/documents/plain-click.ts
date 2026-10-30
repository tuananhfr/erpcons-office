import type { MouseEvent } from 'react'

/** A left click without modifiers; the others keep the link's own behaviour (new tab, new window). */
export function plainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/** A click the browser turns into opening the link elsewhere: Ctrl/⌘/Shift + click or the middle button. */
export function opensElsewhere(event: MouseEvent): boolean {
  return event.button === 1 || (event.button === 0 && (event.metaKey || event.ctrlKey || event.shiftKey))
}
