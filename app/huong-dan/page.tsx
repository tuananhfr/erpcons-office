import { GUIDE_SEO } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { PlatformSection } from '@/components/guide/PlatformSection.tsx'
import { TipList } from '@/components/guide/TipList.tsx'
import { Icon } from '@/components/Icon.tsx'
import { PLATFORMS, SAVING, TROUBLES } from '@/content/guide.ts'

export const metadata = pageMetadata(GUIDE_SEO)
export default function GuidePage() {
  return <><SiteHeader active="guide" /><main id="noi-dung">
    <div className="erp-container erp-guide__intro">
      <h1>Cài ứng dụng và mở tệp</h1>
      <p>Cài Văn phòng như một ứng dụng để mở tệp DOCX, XLSX, PPTX, PDF ngay từ máy hoặc điện thoại. Tệp vẫn ở trên thiết bị của bạn.</p>
      <nav className="erp-guide__jump" aria-label="Chọn thiết bị">
        {PLATFORMS.map(p => <a key={p.id} href={`#${p.id}`}><Icon name={p.icon} />{p.name}</a>)}
      </nav>
    </div>
    <div className="erp-container erp-guide__platforms">
      {PLATFORMS.map(p => <PlatformSection key={p.id} platform={p} />)}
    </div>
    <TipList id="luu-tep-title" title="Lưu tệp ở đâu" items={SAVING} alt />
    <TipList id="su-co-title" title="Khi không mở được tệp" items={TROUBLES} />
  </main><SiteFooter /></>
}
