'use client'

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { OpenFileButton } from '@/components/landing/OpenFileButton.tsx'
import { batchView, type BatchGroup, type BatchView } from '@/lib/files/batch-view.ts'
import { deleteBatch, markRouted, readBatch } from '@/lib/files/intake-store.ts'
import { BatchList, BatchNotice, type BatchIcons, type NoticeKind } from './BatchList.tsx'

type Screen = { kind: 'list'; view: BatchView } | { kind: NoticeKind }

function batchId(): string | null {
  return new URLSearchParams(window.location.search).get('batch')
}

export function BatchIntake({ icons, noticeIcon, pickIcon }: { icons: BatchIcons; noticeIcon: ReactNode; pickIcon: ReactNode }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const settled = screen.kind === 'list' ? screen.view.status : screen.kind

  const load = useCallback(async () => {
    const id = batchId()
    if (!id) { setScreen({ kind: 'missing' }); return }
    try {
      const view = batchView(await readBatch(id))
      setScreen(view.status === 'active' ? { kind: 'list', view } : { kind: view.status })
    } catch {
      setScreen({ kind: 'error' })
    }
  }, [])

  useEffect(() => {
    // A deferred first read keeps the effect free of synchronous state updates.
    const first = setTimeout(() => { void load() }, 0)
    // Coming back from an editor (back button, bfcache, tab switch) shows what it did with the files.
    const again = () => { if (document.visibilityState === 'visible') void load() }
    window.addEventListener('pageshow', again)
    document.addEventListener('visibilitychange', again)
    return () => {
      clearTimeout(first)
      window.removeEventListener('pageshow', again)
      document.removeEventListener('visibilitychange', again)
    }
  }, [load])

  // Move focus to the new heading when the page changes meaning, so screen readers announce it.
  useEffect(() => {
    if (settled !== 'loading') heading.current?.focus()
  }, [settled])

  const open = useCallback((group: BatchGroup, event: MouseEvent<HTMLAnchorElement>) => {
    if (!group.openHref || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    const href = group.openHref
    // ROUTED is cosmetic; a failed write must never keep the user from the editor.
    markRouted(group.openIds).catch(() => {}).finally(() => window.location.assign(href))
  }, [])

  const cancel = useCallback(async () => {
    const id = batchId()
    if (!id) return
    setBusy(true)
    try {
      await deleteBatch(id)
      setScreen({ kind: 'cancelled' })
    } catch {
      setScreen({ kind: 'error' })
    } finally {
      setBusy(false)
    }
  }, [])

  const picker = <OpenFileButton icon={pickIcon} label="Chọn lại tệp" variant={screen.kind === 'list' ? 'secondary' : 'primary'} />
  if (screen.kind !== 'list') return <BatchNotice kind={screen.kind} icon={noticeIcon} picker={picker} headingRef={heading} />
  return <BatchList view={screen.view} icons={icons} picker={picker} busy={busy} headingRef={heading} onOpen={open} onCancel={cancel} />
}
