import { SITE, type EditorEntry } from '../../config/editors.ts'
import { SEO_ASSETS, SEO_BRAND, editorSeo } from './page-seo.ts'
import { softwareApplicationLd } from './structured-data.ts'

const escapeAttribute = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function editorSeoTags(editor: EditorEntry): string[] {
  const { title, description, url } = editorSeo(editor)
  const image = SITE.origin + SEO_ASSETS.image
  return [
    `<title>${escapeAttribute(title)}</title>`,
    `<meta name="description" content="${escapeAttribute(description)}">`,
    `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeAttribute(SEO_BRAND)}">`,
    `<meta property="og:locale" content="vi_VN">`,
    `<meta property="og:title" content="${escapeAttribute(title)}">`,
    `<meta property="og:description" content="${escapeAttribute(description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${image}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${escapeAttribute(SEO_ASSETS.imageAlt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeAttribute(title)}">`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}">`,
    `<meta name="twitter:image" content="${image}">`,
    `<meta name="twitter:image:alt" content="${escapeAttribute(SEO_ASSETS.imageAlt)}">`,
    `<link rel="icon" href="${SEO_ASSETS.icon16}" type="image/png" sizes="16x16">`,
    `<link rel="icon" href="${SEO_ASSETS.icon32}" type="image/png" sizes="32x32">`,
    `<link rel="shortcut icon" href="${SEO_ASSETS.favicon}">`,
    `<link rel="apple-touch-icon" href="${SEO_ASSETS.apple}" sizes="180x180">`,
    `<script type="application/ld+json">${JSON.stringify(softwareApplicationLd(editor)).replace(/</g, '\\u003c')}</script>`,
  ]
}
