import type { MetadataRoute } from 'next'
import { sitemapEntries } from '@/lib/seo/structured-data.ts'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries().map(({ url, priority }) => ({ url, priority, changeFrequency: 'monthly' }))
}
