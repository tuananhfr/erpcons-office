import type { Metadata, Viewport } from 'next'
import { Inter, Patrick_Hand } from 'next/font/google'
import type { ReactNode } from 'react'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker.tsx'
import { CAPTURE_INSTALL_PROMPT } from '@/lib/pwa/install-prompt.ts'
import { PWA_THEME_COLOR } from '@/lib/pwa/web-manifest.ts'
import { SITE } from '@/config/editors.ts'
import { HOME_SEO } from '@/lib/seo/page-seo.ts'
import { brandIcons, pageMetadata } from '@/lib/seo/metadata.ts'
import '@/styles/tokens.css'
import '@/styles/landing.css'
import '@/styles/landing-sections.css'
import '@/styles/explore.css'
import '@/styles/guide.css'

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-font' })

const handwriting = Patrick_Hand({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-script', weight: '400' })

export const metadata: Metadata = {
  ...pageMetadata(HOME_SEO),
  metadataBase: new URL(SITE.origin),
  icons: brandIcons,
  appleWebApp: { capable: true, title: 'Văn phòng', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: PWA_THEME_COLOR, width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${handwriting.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
