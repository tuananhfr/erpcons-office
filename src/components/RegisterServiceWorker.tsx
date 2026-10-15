'use client'

import { useEffect } from 'react'
import { browserWarmUpEnv, startWarmUp } from '@/lib/sw/warm-up.ts'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    // Without the warm-up the first visit caches nothing and the landing would not open offline.
    startWarmUp(navigator.serviceWorker, browserWarmUpEnv())
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
