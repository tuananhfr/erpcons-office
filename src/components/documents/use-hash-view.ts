'use client'

import { useCallback, useEffect, useState } from 'react'
import { ROOT_VIEW, parseView, viewHash, viewState, type View } from '@/lib/documents/route.ts'

const current = (): View => parseView(window.location.hash, window.history.state)

const urlOf = (view: View) => `${window.location.pathname}${window.location.search}${viewHash(view)}`

/**
 * The folder or trash view in the URL fragment, with back/forward support. `replace` rewrites the current entry
 * (a path looked up for a link), so back and reload find the names there.
 */
export function useHashView(): { view: View; navigate: (view: View) => void; replace: (view: View) => void } {
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
    window.history.pushState(viewState(next, window.history.state), '', urlOf(next))
    setView(next)
  }, [])
  const replace = useCallback((next: View) => {
    window.history.replaceState(viewState(next, window.history.state), '', urlOf(next))
    setView(next)
  }, [])
  return { view, navigate, replace }
}
