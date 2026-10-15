import { describe, expect, it } from 'vitest'
import { faqLd, sitemapEntries, softwareApplicationLd } from './structured-data.ts'

describe('structured data', () => {
  it('describes a free browser application', () => {
    expect(softwareApplicationLd()).toMatchObject({
      '@type': 'SoftwareApplication',
      name: 'ERPCons Văn phòng',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: 'https://office.erpcons.vn/',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
      inLanguage: 'vi',
    })
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
      'https://office.erpcons.vn/van-ban/',
      'https://office.erpcons.vn/bang-tinh/',
      'https://office.erpcons.vn/trinh-chieu/',
      'https://office.erpcons.vn/pdf/',
    ])
  })
})
