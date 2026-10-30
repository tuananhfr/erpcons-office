'use client'

import type { ReactNode } from 'react'
import { documentUrl } from '@/lib/documents/formats.ts'
import type { SharingApi } from '@/lib/documents/sharing-api.ts'
import type { SharedDocument } from '@/lib/documents/types.ts'
import { ItemList } from '../ItemList.tsx'
import { ListSkeleton, ProblemPanel, StatusPanel } from '../StatusPanel.tsx'
import { sharedRows } from './shared-rows.tsx'
import { useSharedListing } from './use-shared-listing.ts'

/** The "Được chia sẻ với tôi" tab. Opening a new one clears its mark first, so the dot is right when the user comes back. */
export function SharedView({ api, round, onReload, onUnseen, menu }: {
  api: SharingApi
  /** Bumped by the workspace after a change (leave, share) to read the list again. */
  round: number
  onReload: () => void
  onUnseen: (unseen: number) => void
  menu: (doc: SharedDocument) => ReactNode
}) {
  const { listing, loadMore } = useSharedListing(api, round, onUnseen)

  async function open(doc: SharedDocument) {
    if (doc.isNew) await api.markSeen(doc.id)
    window.location.assign(documentUrl(doc))
  }
  // Opened in another tab: this page stays, so the list is read again for the "Mới" mark and the tab's dot.
  async function openedElsewhere(doc: SharedDocument) {
    if (!doc.isNew) return
    await api.markSeen(doc.id)
    onReload()
  }

  if (listing.status === 'loading') return <ListSkeleton />
  if (listing.status === 'error') return <ProblemPanel problem={listing.problem} onRetry={onReload} />
  if (listing.documents.length === 0) {
    return <StatusPanel icon="shared" title="Chưa có tài liệu nào được chia sẻ với bạn">
      <p>Khi ai đó chia sẻ tài liệu với email PI ID của bạn, tài liệu sẽ hiện ở đây, kèm tên người chia sẻ.</p>
    </StatusPanel>
  }
  return <ItemList label="Tài liệu được chia sẻ với tôi" rows={sharedRows(listing.documents, (doc) => { void open(doc) }, menu, (doc) => { void openedElsewhere(doc) })} updatedLabel="Ngày chia sẻ"
    hasMore={Boolean(listing.nextCursor)} more={listing.more} onMore={() => { void loadMore() }} />
}
