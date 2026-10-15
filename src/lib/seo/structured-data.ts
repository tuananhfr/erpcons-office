import { EDITORS, SITE, editorPath } from '../../config/editors.ts'

export function softwareApplicationLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    description: SITE.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: `${SITE.origin}/`,
    inLanguage: 'vi',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
    featureList: EDITORS.map((e) => `${e.name} (${e.extension})`),
  }
}

export function faqLd(items: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  }
}

export function sitemapEntries(): { url: string; priority: number }[] {
  return [
    { url: `${SITE.origin}/`, priority: 1 },
    { url: `${SITE.origin}/kham-pha/`, priority: 0.7 },
    ...EDITORS.map((e) => ({ url: SITE.origin + editorPath(e.slug), priority: 0.8 })),
  ]
}
