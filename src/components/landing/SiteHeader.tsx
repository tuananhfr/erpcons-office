import Link from 'next/link'
import { SITE } from '@/config/editors.ts'

export function SiteHeader() {
  return (
    <header className="erp-site-header">
      <div className="erp-container erp-site-header__inner">
        <Link className="erp-site-header__brand" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/erpcons-mark.svg" alt="" width={28} height={28} />
          <span>{SITE.name}</span>
        </Link>
        <a className="erp-btn erp-btn--secondary" href="#chuc-nang">Chức năng</a>
      </div>
    </header>
  )
}
