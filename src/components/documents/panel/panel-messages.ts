/** What a panel frame tells the editor shell (editor-shell/online-panel.js); same origin only. */
export type PanelMessage = 'close' | 'changed' | 'restored'

export function postToEditor(type: PanelMessage): void {
  window.parent.postMessage({ erpDocsPanel: type }, window.location.origin)
}

/** Framed by an editor page of this origin; any other framer (reading its origin throws) gets no panel. */
export function inEditorFrame(win: Window = window): boolean {
  if (win.parent === win) return false
  try {
    return win.parent.location.origin === win.location.origin
  } catch {
    return false
  }
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `?doc=<id>`, or null for anything that is not a document id. */
export function panelDocId(search: string): string | null {
  const id = new URLSearchParams(search).get('doc')
  return id && ID.test(id) ? id : null
}
