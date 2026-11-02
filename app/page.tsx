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
        <div className="erp-container erp-support-grid">
          {DESKTOP_DOWNLOADS_ENABLED && <DesktopDownloads />}
          <HelpCard />
        </div>
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
