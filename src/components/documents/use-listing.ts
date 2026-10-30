'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Page, Problem, Result } from '@/lib/documents/types.ts'

export type Listing =
  | { status: 'loading' }
  | { status: 'error'; problem: Problem }
  | { status: 'ready'; page: Page; more: 'idle' | 'loading' | Problem }

const LOADING: Listing = { status: 'loading' }

/**
 * One paged listing (a folder's children or the trash). `key` names what is listed: a new key shows the loading
 * state at once, and an answer for an older key is dropped.
 */
export function useListing(key: string, load: (cursor: string | null) => Promise<Result<Page>>) {
  const [state, setState] = useState<{ key: string; listing: Listing } | null>(null)
  const [round, setRound] = useState(0)
  const loadRef = useRef(load)
  const keyRef = useRef(key)
  useEffect(() => { loadRef.current = load; keyRef.current = key })
  const listing = state && state.key === key ? state.listing : LOADING

  useEffect(() => {
    let live = true
    void loadRef.current(null).then((result) => {
      if (!live) return
      setState({ key, listing: result.ok ? { status: 'ready', page: result.value, more: 'idle' } : { status: 'error', problem: result.problem } })
    })
    return () => { live = false }
  }, [key, round])

  /** `quiet` keeps the current rows on screen until the new answer replaces them (after a change by the user). */
  const reload = useCallback((quiet = false) => {
    if (!quiet) setState({ key: keyRef.current, listing: LOADING })
    setRound((n) => n + 1)
  }, [])

  const loadMore = useCallback(async () => {
    if (listing.status !== 'ready' || !listing.page.nextCursor || listing.more === 'loading') return
    const before = listing.page
    setState({ key, listing: { status: 'ready', page: before, more: 'loading' } })
    const result = await loadRef.current(before.nextCursor)
    if (keyRef.current !== key) return
    setState({
      key,
      listing: result.ok
        ? { status: 'ready', more: 'idle', page: { folders: [...before.folders, ...result.value.folders], documents: [...before.documents, ...result.value.documents], nextCursor: result.value.nextCursor } }
        : { status: 'ready', page: before, more: result.problem },
    })
  }, [listing, key])

  return { listing, reload, loadMore }
}
