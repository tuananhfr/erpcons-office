import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker.tsx'
import { piConfig } from '@/config/pi.ts'
import { siteFlags } from '@/config/site-flags.ts'
import { accountScript } from '@/lib/account/account-script.ts'
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
import '@/styles/intake.css'

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-font' })

export const metadata: Metadata = {
  ...pageMetadata(HOME_SEO),
  metadataBase: new URL(SITE.origin),
  icons: brandIcons,
  appleWebApp: { capable: true, title: 'Văn phòng', statusBarStyle: 'default' },
}

export const viewport: Viewport = { themeColor: PWA_THEME_COLOR, width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  const flags = siteFlags()
  const pi = piConfig(flags.pi, flags.piIssuer)
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        {/* Same account.js as the editors, so the landing shares their sign-in (same-origin storage). */}
        {pi && <script dangerouslySetInnerHTML={{ __html: accountScript(pi) }} />}
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
