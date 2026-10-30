import type { Metadata } from 'next'
import { PanelApp } from '@/components/documents/panel/PanelApp.tsx'
import { docIcons } from '@/components/documents/doc-icons.tsx'
import '@/styles/documents.css'
import '@/styles/documents-sharing.css'

// The editor's "Chia sẻ" button shows this page in a frame (editor-shell/online-panel.js); never a page on its own.
export const metadata: Metadata = { title: 'Chia sẻ', robots: { index: false, follow: false } }

export default function SharePanelPage() {
  return <PanelApp kind="share" icons={docIcons} />
}
