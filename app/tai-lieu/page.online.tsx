import type { Metadata } from 'next'
import { Icon } from '@/components/Icon.tsx'
import { DocumentsApp } from '@/components/documents/DocumentsApp.tsx'
import type { DocIcons } from '@/components/documents/IconsContext.tsx'
import { DOC_ICONS, type DocIconName } from '@/components/documents/icon-names.ts'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { createPageSeo } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import '@/styles/documents.css'

// Built only with online documents on (`page.online.tsx`, see src/config/site-flags.ts). Per-user content: not indexed.
const SEO = createPageSeo('/tai-lieu/', 'Tài liệu của tôi', 'Tài liệu lưu online của bạn trên Văn phòng by ERPCons: thư mục, tạo mới, tải lên và thùng rác.')
export const metadata: Metadata = { ...pageMetadata(SEO), robots: { index: false, follow: false } }

const icons = Object.fromEntries(
  (Object.keys(DOC_ICONS) as DocIconName[]).map((name) => [name, <Icon key={name} name={DOC_ICONS[name]} />]),
) as DocIcons

export default function DocumentsPage() {
  return <><SiteHeader active="documents" /><main id="noi-dung" className="erp-container">
    <DocumentsApp icons={icons} />
  </main><SiteFooter /></>
}
