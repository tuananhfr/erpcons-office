import type { Metadata } from 'next'
import { DocumentsApp } from '@/components/documents/DocumentsApp.tsx'
import { docIcons } from '@/components/documents/doc-icons.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { createPageSeo } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import '@/styles/documents.css'
import '@/styles/documents-sharing.css'

// Built only with online documents on (`page.online.tsx`, see src/config/site-flags.ts). Per-user content: not indexed.
const SEO = createPageSeo('/tai-lieu/', 'Tài liệu của tôi', 'Tài liệu lưu online của bạn trên Văn phòng by ERPCons: thư mục, tạo mới, tải lên và thùng rác.')
export const metadata: Metadata = { ...pageMetadata(SEO), robots: { index: false, follow: false } }

export default function DocumentsPage() {
  return <><SiteHeader active="documents" /><main id="noi-dung" className="erp-container">
    <DocumentsApp icons={docIcons} />
  </main><SiteFooter /></>
}
