import type { Metadata } from 'next'
import { SITE } from '../../config/editors.ts'
import { SEO_ASSETS, SEO_BRAND, type PageSeo } from './page-seo.ts'

export function pageMetadata(page: PageSeo): Metadata {
  const image = new URL(SEO_ASSETS.image, SITE.origin).href
  return {
    title: { absolute: page.title },
    description: page.description,
    alternates: { canonical: page.url },
    openGraph: {
      type: 'website',
      siteName: SEO_BRAND,
      locale: 'vi_VN',
      url: page.url,
      title: page.title,
      description: page.description,
      images: [{ url: image, width: 1200, height: 630, alt: SEO_ASSETS.imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [{ url: image, alt: SEO_ASSETS.imageAlt }],
    },
  }
}

export const brandIcons: Metadata['icons'] = {
  icon: [
    { url: SEO_ASSETS.icon16, sizes: '16x16', type: 'image/png' },
    { url: SEO_ASSETS.icon32, sizes: '32x32', type: 'image/png' },
    { url: SEO_ASSETS.icon192, sizes: '192x192', type: 'image/png' },
    { url: SEO_ASSETS.icon512, sizes: '512x512', type: 'image/png' },
  ],
  shortcut: SEO_ASSETS.favicon,
  apple: [{ url: SEO_ASSETS.apple, sizes: '180x180', type: 'image/png' }],
}
