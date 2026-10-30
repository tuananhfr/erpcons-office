import { createElement, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createSharingApi } from '@/lib/documents/sharing-api.ts'
import type { Permission, Version } from '@/lib/documents/types.ts'
import { IconsProvider, type DocIcons } from './IconsContext.tsx'
import { DOC_ICONS, type DocIconName } from './icon-names.ts'
import { ItemList, type Row } from './ItemList.tsx'
import { ViewTabs } from './ViewTabs.tsx'
import { inEditorFrame, panelDocId } from './panel/panel-messages.ts'
import { sharedRows } from './shared/shared-rows.tsx'
import type { SharedDocument } from '@/lib/documents/types.ts'
import type { MouseEvent } from 'react'
import { CopyLinkButton } from './share/CopyLinkButton.tsx'
import { GeneralAccess } from './share/GeneralAccess.tsx'
import { InviteForm } from './share/InviteForm.tsx'
import { PersonRow } from './share/PersonRow.tsx'
import { ShareDialog } from './share/ShareDialog.tsx'
import { ShareSettingsPanel } from './share/ShareSettingsPanel.tsx'
import { LeaveDialog } from './shared/LeaveDialog.tsx'
import { RestoreConfirm } from './versions/RestoreConfirm.tsx'
import { VersionRow } from './versions/VersionRow.tsx'

const icons = Object.fromEntries((Object.keys(DOC_ICONS) as DocIconName[]).map((name) => [name, createElement('i', { key: name })])) as unknown as DocIcons
const Provider = IconsProvider as FunctionComponent<{ icons: DocIcons; children?: ReactNode }>
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { icons }, node))
const never = () => Promise.reject(new Error('no request at render'))
const api = createSharingApi(never)
const done = () => Promise.resolve(null)
const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'

const person = (over: Partial<Permission> = {}): Permission => ({
  id: 'p1', actorId: 'usr_binh', displayName: 'Trần Bình', email: 'binh@example.com', role: 'viewer', pending: false, createdAt: '', expiresAt: null, ...over,
})

describe('share dialog parts', () => {
  it('a person: role picker and menu for people who can share, the role as text for the others', () => {
    const editable = render(createElement(PersonRow, { permission: person(), isMe: false, canShare: true, canSetExpiry: true, busy: false, onRole: done, onExpiry: done, onRemove: done }))
    expect(editable).toContain('Vai trò của Trần Bình')
    expect(editable).toMatch(/<option value="viewer" selected="">Người xem<\/option>/)
    expect(editable).toContain('Thao tác với quyền của Trần Bình')
    const readOnly = render(createElement(PersonRow, { permission: person({ role: 'commenter' }), isMe: true, canShare: false, canSetExpiry: false, busy: false, onRole: done, onExpiry: done, onRemove: done }))
    expect(readOnly).not.toContain('<select')
    expect(readOnly).toContain('Trần Bình (bạn)')
    expect(readOnly).toContain('Người nhận xét')
  })

  it('a pending invitation says the person has not signed in yet; names stay text', () => {
    const html = render(createElement(PersonRow, { permission: person({ actorId: null, displayName: '<b>x</b>', pending: true }), isMe: false, canShare: true, canSetExpiry: true, busy: false, onRole: done, onExpiry: done, onRemove: done }))
    expect(html).toContain('Chưa đăng nhập để nhận lời mời')
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(html).not.toContain('<b>x</b>')
  })

  it('"Quyền truy cập chung": Hạn chế or anyone with the link, as a viewer', () => {
    const restricted = render(createElement(GeneralAccess, { enabled: false, expiresAt: null, canShare: true, isOwner: true, busy: false, onEnable: done, onDisable: done }))
    expect(restricted).toContain('Quyền truy cập chung')
    expect(restricted).toMatch(/<option value="restricted" selected="">Hạn chế<\/option>/)
    expect(restricted).toContain('Chỉ những người đã được thêm mới mở được tài liệu.')
    const open = render(createElement(GeneralAccess, { enabled: true, expiresAt: null, canShare: false, isOwner: false, busy: false, onEnable: done, onDisable: done }))
    expect(open).not.toContain('<select')
    expect(open).toContain('Bất kỳ ai có đường liên kết')
    expect(open).toContain('Người xem')
    expect(open).not.toContain('vẫn mở được cho tới khi')
  })

  it('a link with an expiry: only the owner may turn it off or reset it; sharers learn that old links keep working', () => {
    const at = '2026-12-31T16:59:59Z'
    const owner = render(createElement(GeneralAccess, { enabled: true, expiresAt: at, canShare: true, isOwner: true, busy: false, onEnable: done, onDisable: done }))
    expect(owner).not.toMatch(/<select[^>]*disabled/)
    expect(owner).toContain('Người đã có đường liên kết vẫn mở được cho tới khi bạn đặt lại đường liên kết.')
    expect(owner).not.toContain('Chỉ chủ tài liệu')
    const editor = render(createElement(GeneralAccess, { enabled: true, expiresAt: at, canShare: true, isOwner: false, busy: false, onEnable: done, onDisable: done }))
    expect(editor).toMatch(/<select[^>]*disabled=""/)
    expect(editor).toContain('Chỉ chủ tài liệu tắt hoặc đặt lại được.')
    const link = { enabled: true, expiresAt: at, token: TOKEN }
    const copyOnly = render(createElement(CopyLinkButton, { doc: { format: 'docx' }, link, canReset: false, busy: false, onReset: done }))
    expect(copyOnly).toContain('Sao chép đường liên kết')
    expect(copyOnly).not.toContain('Đặt lại đường liên kết')
  })

  it('the link: copy at any time and reset behind a confirmation; nothing while it is off', () => {
    const on = render(createElement(CopyLinkButton, { doc: { format: 'docx' }, link: { enabled: true, expiresAt: null, token: TOKEN }, canReset: true, busy: false, onReset: done }))
    expect(on).toContain('Sao chép đường liên kết')
    expect(on).toContain('Đặt lại đường liên kết')
    // The token goes to the clipboard on click; it is never written into the page.
    expect(on).not.toContain(TOKEN)
    expect(render(createElement(CopyLinkButton, { doc: { format: 'docx' }, link: { enabled: true, expiresAt: null, token: null }, canReset: true, busy: false, onReset: done })))
      .toContain('Hỏi chủ tài liệu để lấy đường liên kết.')
    expect(render(createElement(CopyLinkButton, { doc: { format: 'docx' }, link: { enabled: false, expiresAt: null, token: null }, canReset: true, busy: false, onReset: done }))).toBe('')
  })

  it('the add-people form: email chips, the three roles, notify only once someone is typed', () => {
    const html = render(createElement(InviteForm, { busy: false, skip: [], onInvite: () => Promise.resolve({ problem: null, mailSkipped: 0 }) }))
    expect(html).toContain('Thêm người bằng email')
    expect(html.match(/<option /g)).toHaveLength(3)
    expect(html).toContain('Người chỉnh sửa')
    expect(html).not.toContain('Thông báo cho mọi người')
  })

  it('the gear: two switches with their Google Docs wording', () => {
    const html = render(createElement(ShareSettingsPanel, { settings: { editorsCanShare: true, viewersCanDownload: false }, busy: false, onSave: done, onBack: () => {} }))
    expect(html.match(/role="switch"/g)).toHaveLength(2)
    expect(html).toContain('Người chỉnh sửa có thể thay đổi quyền và chia sẻ')
    expect(html).toContain('Người xem và người nhận xét có thể tải xuống, in và sao chép')
  })

  it('the dialog shows its loading state first and the title as text', () => {
    const html = render(createElement(ShareDialog, { api, doc: { id: 'd1', title: '<i>Hồ sơ</i>', format: 'docx' }, userId: 'usr_an', onClose: () => {}, onChanged: () => {} }))
    expect(html).toContain('Chia sẻ “&lt;i&gt;Hồ sơ&lt;/i&gt;”')
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('>Xong</button>')
  })
})

describe('version history parts', () => {
  const version = (n: number): Version => ({ version: n, size: 2048, authorName: 'Trần Bình', createdAt: '2026-10-20T07:05:00Z' })
  const row = (n: number, current: number, canDelete = false, asking: 'restore' | 'delete' | null = null) => render(createElement(VersionRow, {
    version: version(n), current, viewUrl: `/van-ban/?doc=d1&version=${n}`, canDelete, asking, busy: false,
    onDownload: () => {}, onAsk: () => {}, onRestore: () => {}, onDelete: () => {}, onCancel: () => {},
  }))

  it('"Xoá phiên bản này" sits in the menu of an old version, for the owner only, never on the current version', () => {
    expect(row(2, 3, true)).toContain('aria-label="Thao tác khác với phiên bản 2"')
    expect(row(2, 3, false)).not.toContain('Thao tác khác')
    expect(row(3, 3, true)).not.toContain('Thao tác khác')
    expect(row(3, 3, true, 'delete')).not.toContain('Xoá vĩnh viễn')
  })

  it('deleting asks first, plainly, with "Huỷ" ahead of "Xoá"', () => {
    const html = row(2, 3, true, 'delete')
    expect(html).toContain('<strong>Xoá vĩnh viễn phiên bản này?</strong> Không thể hoàn tác.')
    expect(html.indexOf('>Huỷ<')).toBeLessThan(html.indexOf('>Xoá<'))
    expect(html).toContain('erp-btn--danger')
  })

  it('the current version is tagged and cannot be restored; an older one can', () => {
    const current = row(3, 3)
    expect(current).toContain('Phiên bản hiện tại')
    expect(current).not.toContain('Khôi phục')
    const older = row(2, 3)
    expect(older).toContain('aria-label="Khôi phục phiên bản 2"')
    expect(older).toContain('Trần Bình')
    expect(older).toContain('2 KB')
  })

  it('"Xem" opens the version read-only in a new tab, without handing it this window', () => {
    expect(row(2, 3)).toMatch(/<a [^>]*href="\/van-ban\/\?doc=d1&amp;version=2" target="_blank" rel="noopener"/)
  })

  it('the restore confirmation says what happens: a new version, nothing lost', () => {
    const html = render(createElement(RestoreConfirm, { version: 2, current: 5, busy: false, onConfirm: () => {}, onCancel: () => {} }))
    expect(html).toContain('Khôi phục phiên bản này?')
    expect(html).toContain('sẽ thành phiên bản 6')
    expect(html).toContain('vẫn giữ trong lịch sử')
  })
})

describe('"Được chia sẻ với tôi"', () => {
  it('the tab carries a dot and the count for screen readers while something is new', () => {
    const tabs = (unseen: number) => render(createElement(ViewTabs, { view: { kind: 'shared' }, unseen, onDocuments: () => {}, onShared: () => {}, onTrash: () => {} }))
    expect(tabs(2)).toContain('erp-docs-tabs__dot')
    expect(tabs(2)).toContain('2 mục mới')
    expect(tabs(2)).toMatch(/href="#chia-se" aria-current="page"/)
    expect(tabs(0)).not.toContain('erp-docs-tabs__dot')
  })

  it('a row shows the owner, "Mới" until opened, and my shared documents get a mark', () => {
    const rows: Row[] = [
      { key: 's:1', icon: 'docx', name: 'Kế hoạch', href: '/van-ban/?doc=1', type: 'Văn bản', updated: '', size: '1 KB', owner: 'Của An', isNew: true, action: null },
      { key: 'd:2', icon: 'xlsx', name: 'Dự toán', href: '/bang-tinh/?doc=2', type: 'Bảng tính', updated: '', size: '1 KB', shared: true, action: null },
    ]
    const html = render(createElement(ItemList, { label: 'Danh sách', rows, updatedLabel: 'Ngày chia sẻ', hasMore: false, more: 'idle', onMore: () => {} }))
    expect(html).toContain('Của An')
    expect(html).toContain('>Mới</span>')
    expect(html).toContain('data-new="true"')
    expect(html).toContain('Đã chia sẻ')
  })

  it('leaving asks first, with focus on Huỷ', () => {
    const html = render(createElement(LeaveDialog, { api, doc: { id: 'd1', title: 'Kế hoạch', ownerName: 'An' }, userId: 'usr_binh', onClose: () => {}, onDone: () => {} }))
    expect(html).toContain('Gỡ khỏi danh sách của tôi')
    expect(html).toContain('cho đến khi An chia sẻ lại')
    expect(html).toMatch(/<button[^>]*data-autofocus="true"[^>]*>Huỷ<\/button>/)
  })
})

describe('the editor panel pages', () => {
  it('take nothing but a document id from ?doc=', () => {
    expect(panelDocId('?doc=7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d')).toBe('7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d')
    expect(panelDocId('?doc=../me')).toBeNull()
    expect(panelDocId('')).toBeNull()
  })

  it('run only when framed by a page of this origin', () => {
    const origin = 'https://office.erpcons.ai'
    const self = { location: { origin } } as unknown as Window & { parent: Window }
    const framed = (parent: unknown) => inEditorFrame({ location: { origin }, parent } as unknown as Window)
    self.parent = self
    expect(inEditorFrame(self)).toBe(false)
    expect(framed({ location: { origin } })).toBe(true)
    expect(framed({ location: { origin: 'https://evil.example' } })).toBe(false)
    // A cross-origin parent throws on reading its location.
    expect(framed({ get location(): never { throw new DOMException('Blocked a frame', 'SecurityError') } })).toBe(false)
  })
})

describe('opening a shared document marks it seen', () => {
  const doc: SharedDocument = {
    id: '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d', folderId: null, title: 'Kế hoạch', kind: 'word', format: 'docx', size: 1024, version: 1,
    trashedAt: null, updatedAt: '2026-10-29T08:00:00Z', role: 'viewer', ownerName: 'An', shared: false, canDownload: true, canShare: false,
    sharedAt: '2026-10-29T08:00:00Z', isNew: true,
  }
  function clickRow(event: Partial<MouseEvent<HTMLAnchorElement>>) {
    const calls: string[] = []
    const [row] = sharedRows([doc], () => calls.push('open'), () => null, () => calls.push('seen'))
    let prevented = false
    row.onOpen!({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, preventDefault: () => { prevented = true }, ...event } as MouseEvent<HTMLAnchorElement>)
    return { calls, prevented }
  }

  it('a plain click opens it here (which marks it), a Ctrl/⌘/Shift-click or middle click in another tab marks it too', () => {
    expect(clickRow({})).toEqual({ calls: ['open'], prevented: true })
    expect(clickRow({ ctrlKey: true })).toEqual({ calls: ['seen'], prevented: false })
    expect(clickRow({ metaKey: true })).toEqual({ calls: ['seen'], prevented: false })
    expect(clickRow({ shiftKey: true })).toEqual({ calls: ['seen'], prevented: false })
    expect(clickRow({ button: 1 })).toEqual({ calls: ['seen'], prevented: false })
  })

  it('a right click (context menu) or Alt-click (download) does not', () => {
    expect(clickRow({ button: 2 })).toEqual({ calls: [], prevented: false })
    expect(clickRow({ altKey: true })).toEqual({ calls: [], prevented: false })
  })
})
