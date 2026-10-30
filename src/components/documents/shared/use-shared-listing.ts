'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'
import type { Problem, SharedDocument } from '@/lib/documents/types.ts'

export type SharedListing =
  | { status: 'loading' }
  | { status: 'error'; problem: Problem }
  | { status: 'ready'; documents: SharedDocument[]; nextCursor: string | null; more: 'idle' | 'loading' | Problem }

/**
 * "Được chia sẻ với tôi", most recently shared first. Every answer also reports how many are still new, for the
 * tab's dot. A new `round` reads the first page again and keeps the rows on screen meanwhile.
 */
export function useSharedListing(api: SharingApi, round: number, onUnseen: (unseen: number) => void) {
  const [listing, setListing] = useState<SharedListing>({ status: 'loading' })
  const listingRef = useRef(listing)
  const unseenRef = useRef(onUnseen)
  useEffect(() => { listingRef.current = listing; unseenRef.current = onUnseen })

  useEffect(() => {
    let live = true
    void api.shared().then((result) => {
      if (!live) return
      if (!result.ok) return setListing({ status: 'error', problem: result.problem })
      unseenRef.current(result.value.unseen)
      setListing({ status: 'ready', documents: result.value.documents, nextCursor: result.value.nextCursor, more: 'idle' })
    })
    return () => { live = false }
  }, [api, round])

  const loadMore = useCallback(async () => {
    const before = listingRef.current
    if (before.status !== 'ready' || !before.nextCursor || before.more === 'loading') return
    setListing({ ...before, more: 'loading' })
    const result = await api.shared(before.nextCursor)
    setListing((current) => {
      if (current.status !== 'ready') return current
      return result.ok
        ? { ...current, documents: [...current.documents, ...result.value.documents], nextCursor: result.value.nextCursor, more: 'idle' }
        : { ...current, more: result.problem }
    })
  }, [api])

  return { listing, loadMore }
}
