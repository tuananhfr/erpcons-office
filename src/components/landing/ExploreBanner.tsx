import { Icon } from '@/components/Icon.tsx'

export function ExploreBanner() {
  return <aside className="erp-container erp-explore-banner">
    <a href="/kham-pha/"><span className="erp-explore-banner__icon"><Icon name="grid" /></span><span><strong>Còn nhiều điều để khám phá</strong><span>Công cụ cho công việc và cuộc sống mỗi ngày.</span></span><span className="erp-explore-banner__arrow"><Icon name="arrow-right" /></span></a>
  </aside>
}
