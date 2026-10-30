'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'
import type { GrantRole, Permission, Problem, Result, ShareSettings, Sharing } from '@/lib/documents/types.ts'

export type SharingState =
  | { status: 'loading' }
  | { status: 'error'; problem: Problem }
  | { status: 'ready'; sharing: Sharing }

/** What a change answered: the problem, or how many notification emails the daily cap held back. */
export type ChangeOutcome = { problem: Problem } | { problem: null; mailSkipped: number }

/**
 * The share dialog's data: one load, then every change applied from the server's answer (never optimistically, so
 * the list always shows what the server holds). `onChanged` hears about every successful change. The link token in
 * here is memory only.
 */
export function useSharing(api: SharingApi, documentId: string, onChanged: () => void) {
  const [state, setState] = useState<SharingState>({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const changed = useRef(onChanged)
  useEffect(() => { changed.current = onChanged })

  const [round, setRound] = useState(0)
  useEffect(() => {
    let live = true
    void api.sharing(documentId).then((result) => {
      if (live) setState(result.ok ? { status: 'ready', sharing: result.value } : { status: 'error', problem: result.problem })
    })
    return () => { live = false }
  }, [api, documentId, round])
  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setRound((n) => n + 1)
  }, [])

  /** Runs one change; the answer is folded into the shown sharing. Resolves to the problem, or null on success. */
  const run = useCallback(async <T,>(send: () => Promise<Result<T>>, apply: (sharing: Sharing, value: T) => Sharing): Promise<Problem | null> => {
    setBusy(true)
    const result = await send()
    setBusy(false)
    if (!result.ok) return result.problem
    setState((current) => (current.status === 'ready' ? { status: 'ready', sharing: apply(current.sharing, result.value) } : current))
    changed.current()
    return null
  }, [])

  const replace = (sharing: Sharing, next: Permission): Sharing =>
    ({ ...sharing, permissions: sharing.permissions.map((p) => (p.id === next.id ? next : p)) })
  const linkOn = (sharing: Sharing, token: string): Sharing => ({ ...sharing, link: { ...sharing.link, enabled: true, token } })
  const linkOff = (sharing: Sharing): Sharing => ({ ...sharing, link: { enabled: false, expiresAt: null, token: null } })

  return {
    state,
    busy,
    reload,
    invite: async (emails: string[], role: GrantRole, notify: boolean, message: string | null): Promise<ChangeOutcome> => {
      let skipped = 0
      // Read from the answer itself: a state updater may only run at the next render.
      const problem = await run(async () => {
        const result = await api.invite(documentId, emails, role, notify, message)
        if (result.ok) skipped = result.value.mailSkipped
        return result
      }, (_old, next) => next.sharing)
      return problem ? { problem } : { problem: null, mailSkipped: skipped }
    },
    changeRole: (permissionId: string, role: GrantRole) =>
      run(() => api.changeRole(documentId, permissionId, role), replace),
    changeExpiry: (permissionId: string, expiresAt: string | null) =>
      run(() => api.changeExpiry(documentId, permissionId, expiresAt), replace),
    remove: (permissionId: string) =>
      run(() => api.remove(documentId, permissionId), (sharing) => ({
        ...sharing, permissions: sharing.permissions.filter((p) => p.id !== permissionId), total: Math.max(0, sharing.total - 1),
      })),
    saveSettings: (settings: ShareSettings) =>
      run(() => api.saveSettings(documentId, settings), (sharing, next: ShareSettings) => ({ ...sharing, settings: next })),
    enableLink: () => run(() => api.enableLink(documentId), linkOn),
    disableLink: () => run(() => api.disableLink(documentId), linkOff),
    /** "Đặt lại đường liên kết": off then on, so the server issues a new token and the old link stops working. */
    resetLink: async (): Promise<Problem | null> => {
      const off = await run(() => api.disableLink(documentId), linkOff)
      return off ?? run(() => api.enableLink(documentId), linkOn)
    },
  }
}

export type SharingControls = ReturnType<typeof useSharing>
