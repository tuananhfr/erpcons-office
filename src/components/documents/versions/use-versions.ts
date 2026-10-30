'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { problem } from '@/lib/documents/problem.ts'
import { fileName, saveBlob } from '@/lib/documents/save-file.ts'
import type { VersionsApi } from '@/lib/documents/versions-api.ts'
import type { DocumentItem, Problem, Version } from '@/lib/documents/types.ts'

export type VersionsState =
  | { status: 'loading' }
  | { status: 'error'; problem: Problem }
  | { status: 'ready'; doc: DocumentItem; etag: string; versions: Version[]; nextCursor: string | null; more: 'idle' | 'loading' | Problem }

/**
 * The document (for its current version and ETag) and its versions, newest first. A restore names the ETag read here;
 * whatever it answers, the list is read again so it shows what the server holds.
 */
export function useVersions(api: VersionsApi, documentId: string) {
  const [state, setState] = useState<VersionsState>({ status: 'loading' })
  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state })

  const read = useCallback(async (): Promise<VersionsState> => {
    const [doc, page] = await Promise.all([api.document(documentId), api.versions(documentId)])
    if (!doc.ok) return { status: 'error', problem: doc.problem }
    if (!page.ok) return { status: 'error', problem: page.problem }
    return { status: 'ready', doc: doc.value.doc, etag: doc.value.etag, versions: page.value.versions, nextCursor: page.value.nextCursor, more: 'idle' }
  }, [api, documentId])
  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    void read().then((next) => { if (live) setState(next) })
    return () => { live = false }
  }, [read, round])
  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setRound((n) => n + 1)
  }, [])

  const loadMore = useCallback(async () => {
    const before = stateRef.current
    if (before.status !== 'ready' || !before.nextCursor || before.more === 'loading') return
    setState({ ...before, more: 'loading' })
    const result = await api.versions(documentId, before.nextCursor)
    setState((current) => {
      if (current.status !== 'ready') return current
      return result.ok
        ? { ...current, versions: [...current.versions, ...result.value.versions], nextCursor: result.value.nextCursor, more: 'idle' }
        : { ...current, more: result.problem }
    })
  }, [api, documentId])

  /** Resolves to the new current version, or the problem (a 409 means someone saved meanwhile). */
  const restore = useCallback(async (seq: number): Promise<{ ok: true; version: number } | { ok: false; problem: Problem }> => {
    const current = stateRef.current
    if (current.status !== 'ready') return { ok: false, problem: problem('failed', null, true) }
    const result = await api.restore(documentId, seq, current.etag)
    setState(await read())
    return result.ok ? { ok: true, version: result.value.doc.version } : { ok: false, problem: result.problem }
  }, [api, documentId, read])

  /** Whatever it answers, the list is read again: a version deleted elsewhere is gone either way. */
  const remove = useCallback(async (seq: number): Promise<Problem | null> => {
    const result = await api.remove(documentId, seq)
    setState(await read())
    return result.ok ? null : result.problem
  }, [api, documentId, read])

  const download = useCallback(async (seq: number): Promise<Problem | null> => {
    const current = stateRef.current
    if (current.status !== 'ready') return null
    const result = await api.bytes(documentId, seq)
    if (!result.ok) return result.problem
    saveBlob(result.value, fileName(current.doc.title, current.doc.format, seq))
    return null
  }, [api, documentId])

  return { state, reload, loadMore, restore, remove, download }
}
