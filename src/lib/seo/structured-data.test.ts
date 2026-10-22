import { describe, expect, it } from 'vitest'
import { faqLd, sitemapEntries, softwareApplicationLd, websiteLd } from './structured-data.ts'

describe('structured data', () => {
  it('describes a free browser application', () => {
    expect(softwareApplicationLd()).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Văn phòng by ERPCons',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: 'https://office.erpcons.ai/',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
      inLanguage: 'vi',
    })
  })

  it('uses the same product brand for the website name', () => {
    expect(websiteLd()).toMatchObject({ '@type': 'WebSite', name: 'Văn phòng by ERPCons', url: 'https://office.erpcons.ai/' })
  })

  it('turns FAQ items into a FAQPage', () => {
    expect(faqLd([{ question: 'Q?', answer: 'A.' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A.' } }],
    })
  })

  it('lists the landing and the four editors', () => {
    expect(sitemapEntries().map((e) => e.url)).toEqual([
      'https://office.erpcons.ai/',
      'https://office.erpcons.ai/kham-pha/',
      'https://office.erpcons.ai/huong-dan/',
      'https://office.erpcons.ai/van-ban/',
      'https://office.erpcons.ai/bang-tinh/',
      'https://office.erpcons.ai/trinh-chieu/',
      'https://office.erpcons.ai/pdf/',
    ])
  })
})
