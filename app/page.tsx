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
import { FAQ } from '@/content/landing.ts'
import { faqLd, softwareApplicationLd, websiteLd } from '@/lib/seo/structured-data.ts'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="noi-dung">
        <Hero />
        <FeatureGrid />
        {DESKTOP_DOWNLOADS_ENABLED && <DesktopDownloads />}
        <ExploreBanner />
        <WhyUse />
        <Notices />
        <Faq />
      </main>
      <SiteFooter />
      <JsonLd data={websiteLd()} />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqLd(FAQ)} />
    </>
  )
}
