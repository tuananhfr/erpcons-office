import { createElement, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AccountSnapshot } from '@/lib/account/types.ts'
import { DocumentsApp } from './DocumentsApp.tsx'
import { IconsProvider, type DocIcons } from './IconsContext.tsx'
import { DOC_ICONS, type DocIconName } from './icon-names.ts'
import { ItemList, type Row } from './ItemList.tsx'
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
})
