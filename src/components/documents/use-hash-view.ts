'use client'

import { useCallback, useEffect, useState } from 'react'
import { ROOT_VIEW, parseView, viewHash, viewState, type View } from '@/lib/documents/route.ts'

const current = (): View => parseView(window.location.hash, window.history.state)

/** The folder or trash view in the URL fragment, with back/forward support. */
export function useHashView(): [View, (view: View) => void] {
  const [view, setView] = useState<View>(ROOT_VIEW)
  useEffect(() => {
    const sync = () => setView(current())
    sync()
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])
  const navigate = useCallback((next: View) => {
    const url = `${window.location.pathname}${window.location.search}${viewHash(next)}`
    window.history.pushState(viewState(next, window.history.state), '', url)
    setView(next)
  }, [])
  return [view, navigate]
}
