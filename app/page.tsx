import { JsonLd } from '@/components/JsonLd.tsx'
import { Faq } from '@/components/landing/Faq.tsx'
import { FeatureGrid } from '@/components/landing/FeatureGrid.tsx'
import { ExploreBanner } from '@/components/landing/ExploreBanner.tsx'
import { Hero } from '@/components/landing/Hero.tsx'
import { Notices } from '@/components/landing/Notices.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { WhyUse } from '@/components/landing/WhyUse.tsx'
import { FAQ } from '@/content/landing.ts'
import { faqLd, softwareApplicationLd } from '@/lib/seo/structured-data.ts'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main id="noi-dung">
        <Hero />
        <FeatureGrid />
        <ExploreBanner />
        <WhyUse />
        <Notices />
        <Faq />
      </main>
      <SiteFooter />
      <JsonLd data={softwareApplicationLd()} />
      <JsonLd data={faqLd(FAQ)} />
    </>
  )
}
