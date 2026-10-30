/* eslint-disable @next/next/no-html-link-for-pages -- Static hosting uses full navigation without RSC rewrites. */
import { Brand } from '@/components/Brand.tsx'
import { Icon } from '@/components/Icon.tsx'
import { InstallAppButton } from '@/components/InstallAppButton.tsx'
import { AccountMenu } from '@/components/landing/AccountMenu.tsx'
import { DESKTOP_DOWNLOADS_ENABLED } from '@/config/desktop.ts'
import { siteFlags } from '@/config/site-flags.ts'

// `signup` has no navigation entry, so nothing is marked current.
type Page = 'home' | 'explore' | 'guide' | 'documents' | 'signup'

function Navigation({ active }: { active: Page }) {
  return <>
    <a className="erp-nav-home" href="/" aria-current={active === 'home' ? 'page' : undefined}>Trang chủ</a>
    <a href="/#chuc-nang">Công cụ</a>
    {DESKTOP_DOWNLOADS_ENABLED && <a href="/#tai-ban-desktop">Tải về</a>}
    <a href="/kham-pha/" aria-current={active === 'explore' ? 'page' : undefined}>Khám phá</a>
    <a href="/huong-dan/" aria-current={active === 'guide' ? 'page' : undefined}>Hướng dẫn</a>
    {siteFlags().online && <a href="/tai-lieu/" aria-current={active === 'documents' ? 'page' : undefined}>Tài liệu của tôi</a>}
  </>
}

function Install({ variant }: { variant: 'header' | 'menu' }) {
  return <InstallAppButton variant={variant} icon={<Icon name="download" />} shareIcon={<Icon name="box-arrow-up" label="Chia sẻ" />} />
}

function Account({ variant }: { variant: 'header' | 'menu' }) {
  const flags = siteFlags()
  if (!flags.pi) return null
  return <AccountMenu variant={variant} icon={<Icon name="person" />} signupHref={flags.online ? '/dang-ky/' : null} />
}

export function SiteHeader({ active = 'home' }: { active?: Page }) {
  return <header className="erp-site-header">
    <a className="erp-skip" href="#noi-dung">Đến nội dung chính</a>
    <div className="erp-container erp-site-header__inner">
      <Brand />
      <nav className="erp-desktop-nav" aria-label="Điều hướng chính"><Navigation active={active} /></nav>
      <div className="erp-header-actions">
        <Install variant="header" />
        <Account variant="header" />
        {/* Next to the account entry it never fits on one line; the menu and the footer keep the link. */}
        {!siteFlags().pi && <a className="erp-header-link" href="https://erpcons.ai/">ERPCons - Construction OS <Icon name="arrow-up-right" /></a>}
      </div>
      <details className="erp-mobile-menu">
        <summary aria-label="Mở menu điều hướng"><Icon name="list" /></summary>
        <nav aria-label="Điều hướng di động"><Navigation active={active} /><a href="https://erpcons.ai/">ERPCons - Construction OS ↗</a><Install variant="menu" /><Account variant="menu" /></nav>
      </details>
    </div>
  </header>
}
