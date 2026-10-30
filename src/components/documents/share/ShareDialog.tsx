'use client'

import { useMemo, useState } from 'react'
import { normalizeEmail } from '@/lib/documents/emails.ts'
import { ROLE_LABELS } from '@/lib/documents/roles.ts'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'
import type { DocumentItem } from '@/lib/documents/types.ts'
import { Dialog } from '../Dialog.tsx'
import { useIcon } from '../IconsContext.tsx'
import { ListSkeleton } from '../StatusPanel.tsx'
import { CopyLinkButton } from './CopyLinkButton.tsx'
import { GeneralAccess } from './GeneralAccess.tsx'
import { InviteForm } from './InviteForm.tsx'
import { PersonRow, initialOf } from './PersonRow.tsx'
import { ShareSettingsPanel } from './ShareSettingsPanel.tsx'
import { useSharing } from './use-sharing.ts'

/**
 * "Chia sẻ" like Google Docs: add people by email, who has access, "Quyền truy cập chung", copy the link, and the
 * owner's gear. People who cannot share see the same dialog read-only (the server lists only the owner and them).
 */
export function ShareDialog({ api, doc, userId, onClose, onChanged }: {
  api: SharingApi
  doc: Pick<DocumentItem, 'id' | 'title' | 'format'>
  /** The signed-in account (PI `sub` = actor id), to mark "(bạn)". */
  userId: string | null
  onClose: () => void
  onChanged: () => void
}) {
  const sharing = useSharing(api, doc.id, onChanged)
  const [view, setView] = useState<'main' | 'settings'>('main')
  const gear = useIcon('gear')
  const back = useIcon('back')
  const retry = useIcon('retry')
  const state = sharing.state
  const ready = state.status === 'ready' ? state.sharing : null
  const skip = useMemo(() => {
    if (!ready) return []
    const known = [ready.owner.email, ...ready.permissions.map((p) => p.email)].filter((e): e is string => Boolean(e))
    return known.map(normalizeEmail)
  }, [ready])

  if (view === 'settings' && ready) {
    return <Dialog wide title="Cài đặt chia sẻ" onClose={onClose}
      headActions={<button type="button" className="erp-docs-icon-btn" aria-label="Quay lại Chia sẻ" onClick={() => setView('main')}>{back}</button>}>
      <ShareSettingsPanel settings={ready.settings} busy={sharing.busy} onSave={sharing.saveSettings} onBack={() => setView('main')} />
    </Dialog>
  }

  const isOwner = ready?.role === 'owner'
  return <Dialog wide title={`Chia sẻ “${doc.title}”`} onClose={onClose}
    headActions={isOwner && <button type="button" className="erp-docs-icon-btn" aria-label="Cài đặt chia sẻ" title="Cài đặt chia sẻ" onClick={() => setView('settings')}>{gear}</button>}>
    <div className="erp-docs-dialog__body erp-share">
      {state.status === 'loading' && <ListSkeleton />}
      {state.status === 'error' && <div className="erp-share-error" role="alert">
        <p>{state.problem.kind === 'notFound' ? `${state.problem.message}.` : state.problem.message}</p>
        <button type="button" className="erp-btn erp-btn--secondary" onClick={() => sharing.reload()}>{retry}Thử lại</button>
      </div>}
      {ready && <>
        {ready.canShare && <InviteForm busy={sharing.busy} skip={skip} onInvite={sharing.invite} />}
        <section className="erp-share-section" aria-labelledby="erp-share-people">
          <h3 id="erp-share-people" className="erp-share-section__title">Những người có quyền truy cập</h3>
          <ul className="erp-share-people">
            <li className="erp-share-person">
              <span className="erp-share-person__avatar" data-owner aria-hidden="true">{initialOf(ready.owner.displayName || ready.owner.email || '?')}</span>
              <div className="erp-share-person__main">
                <p className="erp-share-person__name">{(ready.owner.displayName || ready.owner.email || 'Chủ tài liệu') + (ready.owner.actorId === userId ? ' (bạn)' : '')}</p>
                {ready.owner.displayName && ready.owner.email && <p className="erp-share-person__meta"><span>{ready.owner.email}</span></p>}
              </div>
              <span className="erp-share-person__role">{ROLE_LABELS.owner}</span>
            </li>
            {ready.permissions.map((permission) => <PersonRow key={permission.id} permission={permission} isMe={permission.actorId === userId}
              canShare={ready.canShare} canSetExpiry={isOwner} busy={sharing.busy}
              onRole={(role) => sharing.changeRole(permission.id, role)}
              onExpiry={(at) => sharing.changeExpiry(permission.id, at)}
              onRemove={() => sharing.remove(permission.id)} />)}
          </ul>
          {ready.total > ready.permissions.length && <p className="erp-share-general__helper">
            Đang hiện {ready.permissions.length} trong số {ready.total} người có quyền truy cập (những người được thêm sớm nhất).
          </p>}
        </section>
        <GeneralAccess enabled={ready.link.enabled} expiresAt={ready.link.expiresAt} canShare={ready.canShare} isOwner={isOwner} busy={sharing.busy}
          onEnable={sharing.enableLink} onDisable={sharing.disableLink} />
      </>}
      <div className="erp-share-footer">
        {ready && ready.canShare
          ? <CopyLinkButton doc={doc} link={ready.link} canReset={isOwner || ready.link.expiresAt === null} busy={sharing.busy} onReset={sharing.resetLink} />
          : <span />}
        <button type="button" className="erp-btn erp-btn--primary" onClick={onClose}>Xong</button>
      </div>
    </div>
  </Dialog>
}
