import { EDITORS, SITE, editorPath, type EditorEntry } from '../../config/editors.ts'
import { HOME_SEO, SEO_ASSETS, SEO_BRAND, editorSeo } from './page-seo.ts'

export function softwareApplicationLd(editor?: EditorEntry): Record<string, unknown> {
  const page = editor ? editorSeo(editor) : HOME_SEO
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: editor ? `${editor.name} | ${SEO_BRAND}` : SEO_BRAND,
    description: page.description,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web browser',
    url: page.url,
    image: SITE.origin + SEO_ASSETS.image,
    inLanguage: 'vi',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'VND' },
    featureList: (editor ? [editor] : EDITORS).map(entry => `${entry.name} (${entry.extension})`),
  }
}

export function websiteLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SEO_BRAND,
    alternateName: SITE.name,
    url: HOME_SEO.url,
    inLanguage: 'vi',
  }
}

export function faqLd(items: { question: string; answer: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })),
  }
}

export function sitemapEntries(): { url: string; priority: number }[] {
  return [
    { url: HOME_SEO.url, priority: 1 },
    { url: `${SITE.origin}/kham-pha/`, priority: 0.7 },
    { url: `${SITE.origin}/huong-dan/`, priority: 0.6 },
    ...EDITORS.map(editor => ({ url: SITE.origin + editorPath(editor.slug), priority: 0.8 })),
  ]
}
