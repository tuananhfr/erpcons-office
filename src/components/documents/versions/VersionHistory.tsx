'use client'

import { useState } from 'react'
import { documentUrl } from '@/lib/documents/formats.ts'
import type { VersionsApi } from '@/lib/documents/versions-api.ts'
import { Dialog } from '../Dialog.tsx'
import { useIcon } from '../IconsContext.tsx'
import { ListSkeleton } from '../StatusPanel.tsx'
import { VersionRow, type VersionAsk } from './VersionRow.tsx'
import { useVersions } from './use-versions.ts'

type Note = { tone: 'done' | 'error'; text: string } | null

/** "Lịch sử phiên bản" (owner and editors): every saved version, newest first; the owner may delete old ones. */
export function VersionHistory({ api, documentId, title, onClose, onRestored, onDeleted }: {
  api: VersionsApi
  documentId: string
  /** Shown until the document itself has loaded. */
  title: string
  onClose: () => void
  onRestored: (version: number) => void
  /** A version is gone: the owner's quota shown elsewhere may have shrunk. */
  onDeleted?: () => void
}) {
  const { state, reload, loadMore, restore, remove, download } = useVersions(api, documentId)
  const [asking, setAsking] = useState<{ seq: number; ask: VersionAsk } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const retry = useIcon('retry')

  async function confirmRestore(seq: number) {
    setBusy(true)
    const outcome = await restore(seq)
    setBusy(false)
    setAsking(null)
    if (outcome.ok) {
      setNote({ tone: 'done', text: `Đã khôi phục phiên bản ${seq} thành phiên bản ${outcome.version}.` })
      onRestored(outcome.version)
    } else {
      setNote({ tone: 'error', text: outcome.problem.kind === 'conflict'
        ? 'Có người vừa lưu tài liệu nên chưa khôi phục. Danh sách đã được tải lại; hãy chọn lại phiên bản.'
        : outcome.problem.message })
    }
  }
  async function confirmDelete(seq: number) {
    setBusy(true)
    const problem = await remove(seq)
    setBusy(false)
    setAsking(null)
    if (!problem) {
      setNote({ tone: 'done', text: `Đã xoá phiên bản ${seq}.` })
      onDeleted?.()
    } else {
      setNote({ tone: 'error', text: problem.kind === 'notFound' ? `${problem.message}.` : problem.message })
    }
  }
  async function save(seq: number) {
    setNote(null)
    const problem = await download(seq)
    if (problem) setNote({ tone: 'error', text: problem.kind === 'notFound' ? `${problem.message}.` : problem.message })
  }

  const name = state.status === 'ready' ? state.doc.title : title
  return <Dialog wide title="Lịch sử phiên bản" onClose={onClose}>
    <div className="erp-docs-dialog__body erp-versions">
      <p className="erp-versions__doc">{name}</p>
      {state.status === 'loading' && <ListSkeleton />}
      {state.status === 'error' && <div className="erp-share-error" role="alert">
        <p>{state.problem.kind === 'notFound' ? `${state.problem.message}.` : state.problem.message}</p>
        <button type="button" className="erp-btn erp-btn--secondary" onClick={() => reload()}>{retry}Thử lại</button>
      </div>}
      {state.status === 'ready' && <>
        <ul className="erp-versions__list" aria-label="Các phiên bản, mới nhất trước">
          {state.versions.map((version) => <VersionRow key={version.version} version={version} current={state.doc.version}
            viewUrl={`${documentUrl(state.doc)}&version=${version.version}`} canDelete={state.doc.role === 'owner'}
            asking={asking?.seq === version.version ? asking.ask : null} busy={busy}
            onDownload={() => { void save(version.version) }}
            onAsk={(ask) => { setNote(null); setAsking({ seq: version.version, ask }) }}
            onRestore={() => { void confirmRestore(version.version) }}
            onDelete={() => { void confirmDelete(version.version) }}
            onCancel={() => setAsking(null)} />)}
        </ul>
        {state.nextCursor && <div className="erp-docs-list__more">
          {typeof state.more === 'object' && <p className="erp-docs-list__more-error" role="alert">{state.more.message}</p>}
          <button type="button" className="erp-btn erp-btn--secondary" onClick={() => { void loadMore() }} disabled={state.more === 'loading'} aria-busy={state.more === 'loading'}>
            {state.more === 'loading' ? 'Đang tải…' : typeof state.more === 'object' ? 'Thử lại' : 'Tải thêm'}
          </button>
        </div>}
      </>}
      <p className="erp-share-status" data-tone={note?.tone} role="status">{note?.text}</p>
    </div>
  </Dialog>
}
