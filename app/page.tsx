import { JsonLd } from '@/components/JsonLd.tsx'
import { Faq } from '@/components/landing/Faq.tsx'
import { DesktopDownloads } from '@/components/landing/DesktopDownloads.tsx'
import { DESKTOP_DOWNLOADS_ENABLED } from '@/config/desktop.ts'
import { FeatureGrid } from '@/components/landing/FeatureGrid.tsx'
import { ExploreBanner } from '@/components/landing/ExploreBanner.tsx'
import { Hero } from '@/components/landing/Hero.tsx'
import { Notices } from '@/components/landing/Notices.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { WhyUse } from '@/components/landing/WhyUse.tsx'
import { CloudOffice } from '@/components/landing/CloudOffice.tsx'
import { HelpCard } from '@/components/landing/HelpCard.tsx'
import { siteFlags } from '@/config/site-flags.ts'
import { FAQ } from '@/content/landing.ts'
import { faqLd, organizationLd, softwareApplicationLd, websiteLd } from '@/lib/seo/structured-data.ts'

export default function HomePage() {
  return (
    <div className="erp-home">
      <SiteHeader />
      <main id="noi-dung">
        <Hero />
        <FeatureGrid />
        {siteFlags().online && <CloudOffice />}
        <section className="erp-container erp-support" aria-labelledby="support-title">
          <div className="erp-support__heading">
            <h2 id="support-title">{DESKTOP_DOWNLOADS_ENABLED ? 'Tải về và hướng dẫn' : 'Hướng dẫn và cài ứng dụng'}</h2>
            <p>{DESKTOP_DOWNLOADS_ENABLED ? 'Cài đặt ứng dụng Windows hoặc xem hướng dẫn để bắt đầu sử dụng.' : 'Mở, chỉnh sửa và lưu tệp dễ dàng trên thiết bị của bạn.'}</p>
          </div>
          <div className="erp-support-grid">
            {DESKTOP_DOWNLOADS_ENABLED && <DesktopDownloads />}
            <HelpCard />
          </div>
        </section>
        <ExploreBanner />
        <WhyUse />
        <Notices />
        <Faq />
      </main>
      <SiteFooter />
      <JsonLd data={organizationLd()} />
      <JsonLd data={websiteLd()} />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqLd(FAQ)} />
    </div>
  )
}
