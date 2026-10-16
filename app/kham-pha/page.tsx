import { EXPLORE_SEO } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'
import Image from 'next/image'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { ToolCatalog } from '@/components/explore/ToolCatalog.tsx'
import { Icon } from '@/components/Icon.tsx'
import { ECOSYSTEM_TOOLS } from '@/content/ecosystem.ts'

export const metadata = pageMetadata(EXPLORE_SEO)
export default function ExplorePage() {
  const icons = Object.fromEntries(ECOSYSTEM_TOOLS.map(tool => [tool.id, <Icon key={tool.id} name={tool.icon} />]))
  return <><SiteHeader active="explore" /><main id="noi-dung">
    <section className="erp-discovery erp-container" aria-labelledby="explore-title">
      <div className="erp-discovery__copy"><p className="erp-section-label">CÔNG VIỆC · CUỘC SỐNG · CON NGƯỜI</p><h1 id="explore-title">Khám phá<br /><span>hệ sinh thái</span></h1><p>Nhiều công cụ. Chung một điều tốt đẹp.<br />Để công việc nhẹ hơn, cuộc sống vui hơn.</p></div>
      <Image src="/illustrations/ecosystem.webp" alt="Gia đình cùng ngắm thành phố xanh bên sông." width={1536} height={1024} priority sizes="(max-width: 767px) 100vw, 60vw" />
    </section>
    <ToolCatalog icons={icons} />
  </main><SiteFooter /></>
}
