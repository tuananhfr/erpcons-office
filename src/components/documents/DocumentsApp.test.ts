import { createElement, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AccountSnapshot } from '@/lib/account/types.ts'
import { createDocumentsApi } from '@/lib/documents/api.ts'
import { Breadcrumb } from './Breadcrumb.tsx'
import { DocumentsApp } from './DocumentsApp.tsx'
import { IconsProvider, type DocIcons } from './IconsContext.tsx'
import { DOC_ICONS, type DocIconName } from './icon-names.ts'
import { ItemList, type Row } from './ItemList.tsx'
import { PurgeDialog } from './PurgeDialog.tsx'
import { SignInPanel } from './SignInPanel.tsx'

const icons = Object.fromEntries((Object.keys(DOC_ICONS) as DocIconName[]).map((name) => [name, createElement('i', { key: name })])) as unknown as DocIcons
// createElement types children as a prop; the cast lets them go in the children argument, as the lint rule asks.
const Provider = IconsProvider as FunctionComponent<{ icons: DocIcons; children?: ReactNode }>
const render = (node: ReactNode) => renderToStaticMarkup(createElement(Provider, { icons }, node))
const signedOut: AccountSnapshot = {
  version: 1, status: 'signed-out', user: null, orgs: [], activeOrg: null, product: null, entitlements: [], entitlementsFresh: false, error: null,
}

describe('/tai-lieu/ static HTML', () => {
  it('ships the loading state only: no account is known at build time', () => {
    const html = renderToStaticMarkup(createElement(DocumentsApp, { icons }))
    expect(html).toContain('<h1>Tài liệu của tôi</h1>')
    expect(html).toContain('aria-busy="true"')
  })

  it('invites a signed-out user to sign in and repeats the Free promise', () => {
    const html = render(createElement(SignInPanel, { snapshot: signedOut }))
    expect(html).toContain('Đăng nhập để xem tài liệu online')
    expect(html).toContain('Bản Free vẫn không cần tài khoản')
    expect(html).toContain('href="/"')
  })

  it('renders names as text, never as markup', () => {
    const row: Row = { key: 'd:1', icon: 'docx', name: '<img src=x onerror=alert(1)>', href: '/van-ban/?doc=1', type: 'Văn bản', updated: '', size: '1 KB', action: null }
    const html = render(createElement(ItemList, { label: 'Danh sách', rows: [row], updatedLabel: 'Cập nhật', hasMore: false, more: 'idle', onMore: () => {} }))
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })

  it('asks before a permanent delete: names the item as text, says it cannot be undone, danger button', () => {
    const api = createDocumentsApi(() => Promise.reject(new Error('no request at render')))
    const purge = (kind: 'folder' | 'document') => render(createElement(PurgeDialog, {
      api, target: { kind, id: '1', name: '<b>Hồ sơ</b>', parentId: null }, icon: kind === 'folder' ? 'folder' : 'docx', onDone: () => {}, onClose: () => {},
    }))
    const doc = purge('document')
    expect(doc).toContain('Xoá vĩnh viễn tài liệu?')
    expect(doc).toContain('&lt;b&gt;Hồ sơ&lt;/b&gt;')
    expect(doc).not.toContain('<b>')
    expect(doc).toContain('Không thể hoàn tác.')
    expect(doc).toMatch(/class="erp-btn erp-btn--danger"[^>]*>.*Xoá vĩnh viễn<\/button>/)
    expect(doc).not.toContain('thư mục con')
    // Focus starts on Huỷ (Dialog focuses [data-autofocus] after showModal), so Enter alone never deletes.
    expect(doc).toMatch(/<button[^>]*data-autofocus="true"[^>]*>Huỷ<\/button>/)
    const folder = purge('folder')
    expect(folder).toContain('Xoá vĩnh viễn thư mục?')
    expect(folder).toContain('mọi thư mục con và tài liệu bên trong')
  })

  it('shows a placeholder, not "Thư mục này", while the path of a linked folder loads', () => {
    const crumbs = (pending: boolean) => render(createElement(Breadcrumb, { folderId: '7d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d', trail: [], pending, onNavigate: () => {} }))
    expect(crumbs(true)).toContain('erp-docs-crumbs__pending')
    expect(crumbs(true)).toContain('aria-busy="true"')
    expect(crumbs(true)).not.toContain('Thư mục này')
    expect(crumbs(false)).toContain('Thư mục này')
  })
})
