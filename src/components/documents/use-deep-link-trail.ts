'use client'

import { useEffect, useState } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import { lookUpTrail, needsTrailLookup, type TrailLookup } from '@/lib/documents/deep-link.ts'
import type { View } from '@/lib/documents/route.ts'

export type LinkTrail = 'none' | 'pending' | Exclude<TrailLookup, { kind: 'found' }>

/**
 * Names the path of a folder opened from its link: one `GET /folders/{id}`, then `replace` stores the trail in the
 * history entry. A result is tied to the view object it was asked for, so one from an earlier visit never shows.
 */
export function useDeepLinkTrail(api: DocumentsApi, view: View, replace: (view: View) => void): LinkTrail {
  const [answer, setAnswer] = useState<{ view: View; lookup: Exclude<TrailLookup, { kind: 'found' }> } | null>(null)
  useEffect(() => {
    if (!needsTrailLookup(view)) return
    let live = true
    void lookUpTrail(api, view.folderId).then((lookup) => {
      if (!live) return
      if (lookup.kind === 'found') replace({ kind: 'folder', folderId: view.folderId, trail: lookup.trail })
      else setAnswer({ view, lookup })
    })
    return () => { live = false }
  }, [api, view, replace])
  if (!needsTrailLookup(view)) return 'none'
  return answer?.view === view ? answer.lookup : 'pending'
}
