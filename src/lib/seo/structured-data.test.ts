import { describe, expect, it } from 'vitest'
import { faqLd, sitemapEntries, softwareApplicationLd, websiteLd } from './structured-data.ts'

describe('structured data', () => {
  it('describes a free browser application', () => {
    expect(softwareApplicationLd()).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'Văn phòng by ERPCons',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: 'https://office.erpcons.vn/',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
      inLanguage: 'vi',
    })
  })

  it('uses the same product brand for the website name', () => {
    expect(websiteLd()).toMatchObject({ '@type': 'WebSite', name: 'Văn phòng by ERPCons', url: 'https://office.erpcons.vn/' })
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
      'https://office.erpcons.vn/',
      'https://office.erpcons.vn/kham-pha/',
      'https://office.erpcons.vn/van-ban/',
      'https://office.erpcons.vn/bang-tinh/',
      'https://office.erpcons.vn/trinh-chieu/',
      'https://office.erpcons.vn/pdf/',
    ])
  })
})
