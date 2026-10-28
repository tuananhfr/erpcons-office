'use client'

import { useCallback, useMemo, useState } from 'react'
import { createDocumentsApi } from '@/lib/documents/api.ts'
import { documentUrl, type KindInfo } from '@/lib/documents/formats.ts'
import { MESSAGES } from '@/lib/documents/problem.ts'
import { ROOT_VIEW, type Crumb } from '@/lib/documents/route.ts'
import type { ApiFetch, DocumentItem, Folder } from '@/lib/documents/types.ts'
import { Breadcrumb } from './Breadcrumb.tsx'
import { useIcon } from './IconsContext.tsx'
import type { DocIconName } from './icon-names.ts'
import { ItemList } from './ItemList.tsx'
import { MoveDialog, type MoveTarget } from './MoveDialog.tsx'
import { NameDialog } from './NameDialog.tsx'
import { PurgeDialog } from './PurgeDialog.tsx'
import { QuotaMeter } from './QuotaMeter.tsx'
import { RowMenu } from './RowMenu.tsx'
import { folderRows, trashRows } from './rows.tsx'
import { ListSkeleton, ProblemPanel, StatusPanel } from './StatusPanel.tsx'
import { Toast, useToast } from './Toast.tsx'
import { Toolbar } from './Toolbar.tsx'
import { UploadPanel } from './UploadPanel.tsx'
import { ViewTabs } from './ViewTabs.tsx'
import { useDeepLinkTrail } from './use-deep-link-trail.ts'
import { useHashView } from './use-hash-view.ts'
import { useItemActions } from './use-item-actions.ts'
import { useListing } from './use-listing.ts'
import { useQuota } from './use-quota.ts'
import { useUploads } from './use-uploads.ts'

type DialogState =
  | { kind: 'newFolder' }
  | { kind: 'newDocument'; info: KindInfo }
  | { kind: 'rename'; target: MoveTarget }
  | { kind: 'move'; target: MoveTarget }
  | { kind: 'purge'; target: MoveTarget; icon: DocIconName }
  | null

/** The signed-in page: header with quota, tabs and toolbar, the current folder or the trash, and the dialogs. */
export function Workspace({ apiFetch }: { apiFetch: ApiFetch }) {
  const api = useMemo(() => createDocumentsApi(apiFetch), [apiFetch])
  const { view, navigate, replace } = useHashView()
  const linkTrail = useDeepLinkTrail(api, view, replace)
  const linkMissing = typeof linkTrail === 'object' && linkTrail.kind === 'notFound' ? linkTrail.problem : null
  const [quota, refreshQuota] = useQuota(api)
  const [dialog, setDialog] = useState<DialogState>(null)
  const { toast, show, hide } = useToast()
  const inTrash = view.kind === 'trash'
  const folderId = view.kind === 'folder' ? view.folderId : null
  const trail = useMemo(() => (view.kind === 'folder' ? view.trail : []), [view])

  const load = useCallback((cursor: string | null) => (inTrash ? api.trash(cursor) : api.children(folderId, cursor)), [api, inTrash, folderId])
  const { listing, reload, loadMore } = useListing(inTrash ? 'trash' : `folder:${folderId ?? 'root'}`, load)
  const refresh = useCallback(() => { reload(true); refreshQuota() }, [reload, refreshQuota])
  const { trash, restore } = useItemActions(api, refresh, show)
  const uploads = useUploads(api, quota, refresh)

  const icons = { open: useIcon('open'), rename: useIcon('rename'), move: useIcon('move'), trash: useIcon('trash'), restore: useIcon('restore') }
  const closeDialog = useCallback(() => setDialog(null), [])

  const openFolder = useCallback((folder: Folder) => {
    // Opened from a link alone, the current folder's name is unknown: keep its place as "…".
    const base: Crumb[] = folderId && trail.length === 0 ? [{ id: folderId, name: '…' }] : trail
    navigate({ kind: 'folder', folderId: folder.id, trail: [...base, { id: folder.id, name: folder.name }] })
  }, [navigate, folderId, trail])

  const menu = (target: MoveTarget, open: () => void) => <RowMenu label={`Thao tác với “${target.name}”`} items={[
    { label: 'Mở', icon: icons.open, onSelect: open },
    { label: 'Đổi tên', icon: icons.rename, onSelect: () => setDialog({ kind: 'rename', target }) },
    { label: 'Di chuyển', icon: icons.move, onSelect: () => setDialog({ kind: 'move', target }) },
    { label: 'Chuyển vào thùng rác', icon: icons.trash, danger: true, onSelect: () => { void trash(target) } },
  ]} />
  const trashActions = (target: MoveTarget, icon: DocIconName) => <div className="erp-docs-trash-actions">
    <button type="button" className="erp-btn erp-btn--secondary erp-docs-restore" aria-label={`Khôi phục “${target.name}”`}
      onClick={() => { void restore(target) }}>{icons.restore}<span className="erp-docs-restore__label">Khôi phục</span></button>
    <button type="button" className="erp-docs-icon-btn erp-docs-purge" aria-label={`Xoá vĩnh viễn “${target.name}”`} title="Xoá vĩnh viễn"
      onClick={() => setDialog({ kind: 'purge', target, icon })}>{icons.trash}</button>
  </div>

  let content
  if (linkMissing) content = <ProblemPanel problem={linkMissing} onRetry={() => reload()} onHome={() => navigate(ROOT_VIEW)} />
  else if (listing.status === 'loading') content = <ListSkeleton />
  else if (listing.status === 'error') {
    content = <ProblemPanel problem={listing.problem} onRetry={() => reload()} onHome={folderId ? () => navigate(ROOT_VIEW) : undefined} />
  } else {
    const rows = inTrash ? trashRows(listing.page, trashActions) : folderRows(listing.page, openFolder, menu)
    content = rows.length === 0
      ? inTrash
        ? <StatusPanel icon="trash" title="Thùng rác trống"><p>Mục bạn xoá sẽ nằm ở đây 30 ngày trước khi tự xoá hẳn.</p></StatusPanel>
        : <StatusPanel icon="empty" title={folderId ? 'Thư mục này đang trống' : 'Chưa có tài liệu online'}>
          <p>Bấm “Tạo mới” để soạn tài liệu, hoặc “Tải lên” để đưa tệp DOCX, XLSX, PPTX, PDF từ máy lên.</p>
        </StatusPanel>
      : <ItemList label={inTrash ? 'Mục trong thùng rác' : 'Thư mục và tài liệu'} rows={rows} updatedLabel={inTrash ? 'Đã xoá' : 'Cập nhật'}
        hasMore={Boolean(listing.page.nextCursor)} more={listing.more} onMore={() => { void loadMore() }} />
  }

  return <div className="erp-docs">
    <header className="erp-docs__head">
      <div className="erp-docs__title">
        <h1>{inTrash ? 'Thùng rác' : 'Tài liệu của tôi'}</h1>
        <p>{inTrash
          ? 'Mục đã xoá được giữ 30 ngày rồi tự xoá hẳn. Khôi phục để dùng lại, hoặc xoá vĩnh viễn ngay.'
          : 'Lưu trên máy chủ ERPCons, mở lại ở thiết bị khác khi đăng nhập PI ID.'}</p>
      </div>
      <QuotaMeter quota={quota} />
    </header>
    <div className="erp-docs__bar">
      <ViewTabs view={view} onDocuments={() => navigate(ROOT_VIEW)} onTrash={() => navigate({ kind: 'trash' })} />
      {!inTrash && <Toolbar onNew={(info) => setDialog({ kind: 'newDocument', info })} onNewFolder={() => setDialog({ kind: 'newFolder' })}
        onUpload={(files) => uploads.add(files, folderId)} />}
    </div>
    {!inTrash && !linkMissing && <Breadcrumb folderId={folderId} trail={trail} pending={linkTrail === 'pending'} onNavigate={(id, crumbs) => navigate(id ? { kind: 'folder', folderId: id, trail: crumbs } : ROOT_VIEW)} />}
    <UploadPanel uploads={uploads.uploads} onRetry={uploads.retry} onClear={uploads.clear} />
    {content}
    <Toast toast={toast} onHide={hide} />

    {dialog?.kind === 'newFolder' && <NameDialog title="Thư mục mới" label="Tên thư mục" initial="" submitLabel="Tạo thư mục" busyLabel="Đang tạo…"
      send={(name, key) => api.createFolder(folderId, name, key)} onClose={closeDialog}
      onDone={(_folder: Folder, name) => { closeDialog(); refresh(); show({ tone: 'done', text: `Đã tạo thư mục “${name}”.` }) }} />}
    {dialog?.kind === 'newDocument' && <NameDialog title={`${dialog.info.label} mới`} label="Tên tài liệu" initial={dialog.info.defaultTitle}
      submitLabel="Tạo và mở" busyLabel="Đang tạo…" send={(name, key) => api.createBlank(dialog.info.kind, name, folderId, key)} onClose={closeDialog}
      onDone={(doc: DocumentItem) => window.location.assign(documentUrl(doc))} />}
    {dialog?.kind === 'rename' && <NameDialog<unknown> title="Đổi tên" label={dialog.target.kind === 'folder' ? 'Tên thư mục' : 'Tên tài liệu'}
      initial={dialog.target.name} submitLabel="Lưu tên" busyLabel="Đang lưu…" onClose={closeDialog}
      send={(name) => {
        const { target } = dialog
        if (name === target.name) return Promise.resolve({ ok: true as const, value: target })
        return target.kind === 'folder' ? api.renameFolder(target.id, name) : api.renameDocument(target.id, name)
      }}
      onDone={() => { closeDialog(); refresh() }} />}
    {dialog?.kind === 'move' && <MoveDialog api={api} target={dialog.target} onClose={closeDialog}
      onDone={() => { const { target } = dialog; closeDialog(); refresh(); show({ tone: 'done', text: `Đã di chuyển “${target.name}”.` }) }} />}
    {dialog?.kind === 'purge' && <PurgeDialog api={api} target={dialog.target} icon={dialog.icon} onClose={closeDialog}
      onDone={(outcome) => {
        const { target } = dialog
        closeDialog()
        refresh()
        show(outcome.kind === 'purged' ? { tone: 'done', text: `Đã xoá vĩnh viễn “${target.name}”.` } : { tone: 'error', text: `${MESSAGES.notFound}.` })
      }} />}
  </div>
}
