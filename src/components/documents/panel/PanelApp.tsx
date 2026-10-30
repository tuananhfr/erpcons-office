'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createSharingApi } from '@/lib/documents/sharing-api.ts'
import type { DocumentItem, Problem } from '@/lib/documents/types.ts'
import { createVersionsApi } from '@/lib/documents/versions-api.ts'
import { Dialog } from '../Dialog.tsx'
import { IconsProvider, type DocIcons } from '../IconsContext.tsx'
import { ShareDialog } from '../share/ShareDialog.tsx'
import { account, useAccount } from '../use-account.ts'
import { VersionHistory } from '../versions/VersionHistory.tsx'
import { inEditorFrame, panelDocId, postToEditor } from './panel-messages.ts'

export type PanelKind = 'share' | 'history'

const TITLES: Record<PanelKind, string> = { share: 'Chia sẻ', history: 'Lịch sử phiên bản' }

function Notice({ kind, text }: { kind: PanelKind; text: string }) {
  return <Dialog title={TITLES[kind]} onClose={() => postToEditor('close')}>
    <div className="erp-docs-dialog__body">
      <p className="erp-docs-dialog__text" role="alert">{text}</p>
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--primary" onClick={() => postToEditor('close')} data-autofocus>Đóng</button>
      </div>
    </div>
  </Dialog>
}

function Panel({ kind }: { kind: PanelKind }) {
  const snapshot = useAccount()
  const [docId] = useState(() => (typeof window === 'undefined' ? null : panelDocId(window.location.search)))
  const [loaded, setLoaded] = useState<{ ok: true; doc: DocumentItem } | { ok: false; problem: Problem } | null>(null)
  const apiFetch = useCallback((path: string, init?: RequestInit) => {
    const current = account()
    return current ? current.apiFetch(path, init) : Promise.reject(Object.assign(new Error('signed_out'), { code: 'signed_out' }))
  }, [])
  const sharingApi = useMemo(() => createSharingApi(apiFetch), [apiFetch])
  const versionsApi = useMemo(() => createVersionsApi(apiFetch), [apiFetch])
  const signedIn = snapshot?.status === 'signed-in'

  useEffect(() => {
    // Only the editor opens these pages; on their own they would be a dialog over nothing.
    if (!inEditorFrame()) window.location.replace('/tai-lieu/')
  }, [])
  useEffect(() => {
    if (!signedIn || !docId || kind !== 'share') return
    let live = true
    void versionsApi.document(docId).then((result) => { if (live) setLoaded(result.ok ? { ok: true, doc: result.value.doc } : result) })
    return () => { live = false }
  }, [signedIn, docId, kind, versionsApi])

  if (!snapshot) return null
  if (!signedIn) return <Notice kind={kind} text="Hãy đăng nhập PI ID để dùng chức năng này." />
  if (!docId) return <Notice kind={kind} text="Không tìm thấy tài liệu hoặc bạn không có quyền mở." />
  if (kind === 'history') {
    return <VersionHistory api={versionsApi} documentId={docId} title="" onClose={() => postToEditor('close')} onRestored={() => postToEditor('restored')} />
  }
  if (!loaded) return null
  if (!loaded.ok) return <Notice kind={kind} text={loaded.problem.kind === 'notFound' ? `${loaded.problem.message}.` : loaded.problem.message} />
  return <ShareDialog api={sharingApi} doc={loaded.doc} userId={snapshot.user?.id ?? null} onClose={() => postToEditor('close')} onChanged={() => postToEditor('changed')} />
}

/** The share dialog or the version history alone, on a transparent page the editor shows in a frame over itself. */
export function PanelApp({ kind, icons }: { kind: PanelKind; icons: DocIcons }) {
  return <IconsProvider icons={icons}><div className="erp-docs erp-docs-panel"><Panel kind={kind} /></div></IconsProvider>
}
