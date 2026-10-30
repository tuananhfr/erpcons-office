'use client'

import { useEffect, useState } from 'react'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'

/** How many shared documents are still new, for the tab's dot; read once per workspace, then kept by the shared view. */
export function useSharedUnseen(api: SharingApi) {
  const [unseen, setUnseen] = useState(0)
  useEffect(() => {
    let live = true
    void api.shared().then((result) => { if (live && result.ok) setUnseen(result.value.unseen) })
    return () => { live = false }
  }, [api])
  return [unseen, setUnseen] as const
}
