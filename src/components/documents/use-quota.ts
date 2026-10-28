'use client'

import { useCallback, useEffect, useState } from 'react'
import type { DocumentsApi } from '@/lib/documents/api.ts'
import type { Quota } from '@/lib/documents/types.ts'

/** The caller's quota from `/me`; `null` while unknown. A failure only hides the meter, the list still works. */
export function useQuota(api: DocumentsApi): [Quota | null, () => void] {
  const [quota, setQuota] = useState<Quota | null>(null)
  const refresh = useCallback(() => {
    void api.quota().then((result) => { if (result.ok) setQuota(result.value) })
  }, [api])
  useEffect(() => { refresh() }, [refresh])
  return [quota, refresh]
}
