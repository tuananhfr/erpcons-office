import { editorPath } from '../../config/editors.ts'
import { kindInfo } from './formats.ts'
import type { DocumentItem, LinkState } from './types.ts'

/**
 * What "Sao chép đường liên kết" can do. The server returns the link token to people who can share whenever the link
 * is on (`LinkState.token`), so the link can be copied at any time, as in Google Docs. The token only ever lives in
 * the dialog's memory: never in storage, the page URL or a log. In the copied link it sits in the fragment, which
 * never reaches a server log or a Referer.
 */
export type LinkAction = { kind: 'off' } | { kind: 'copy'; url: string } | { kind: 'hidden' }

export function linkUrl(doc: Pick<DocumentItem, 'format'>, token: string, origin: string): string {
  return `${origin}${editorPath(kindInfo(doc.format).editor)}#link=${encodeURIComponent(token)}`
}

/** `hidden`: the link is on but this person may not share, so the server did not give them the token. */
export function linkAction(doc: Pick<DocumentItem, 'format'>, link: LinkState, origin: string): LinkAction {
  if (!link.enabled) return { kind: 'off' }
  return link.token ? { kind: 'copy', url: linkUrl(doc, link.token, origin) } : { kind: 'hidden' }
}
