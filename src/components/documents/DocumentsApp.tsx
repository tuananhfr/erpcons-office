'use client'

import { useCallback } from 'react'
import { IconsProvider, type DocIcons } from './IconsContext.tsx'
import { SignInPanel, UnavailablePanel } from './SignInPanel.tsx'
import { ListSkeleton } from './StatusPanel.tsx'
import { Workspace } from './Workspace.tsx'
import { account, useAccount } from './use-account.ts'

function Gate() {
  const snapshot = useAccount()
  const apiFetch = useCallback((path: string, init?: RequestInit) => {
    const current = account()
    return current ? current.apiFetch(path, init) : Promise.reject(Object.assign(new Error('signed_out'), { code: 'signed_out' }))
  }, [])
  if (!snapshot) return <div className="erp-docs"><div className="erp-docs__head"><div className="erp-docs__title"><h1>Tài liệu của tôi</h1></div></div><ListSkeleton /></div>
  if (snapshot.status === 'signed-in') return <Workspace key={snapshot.user?.id ?? ''} apiFetch={apiFetch} userId={snapshot.user?.id ?? null} />
  return <div className="erp-docs">
    <div className="erp-docs__head"><div className="erp-docs__title"><h1>Tài liệu của tôi</h1></div></div>
    {snapshot.status === 'disabled' ? <UnavailablePanel /> : <SignInPanel snapshot={snapshot} />}
  </div>
}

/** /tai-lieu/: the account decides what shows; a new account gets a fresh workspace (nothing of the previous one). */
export function DocumentsApp({ icons }: { icons: DocIcons }) {
  return <IconsProvider icons={icons}><Gate /></IconsProvider>
}
