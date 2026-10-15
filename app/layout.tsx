import type { Metadata, Viewport } from 'next'
import { Inter, Patrick_Hand } from 'next/font/google'
import type { ReactNode } from 'react'
import { RegisterServiceWorker } from '@/components/RegisterServiceWorker.tsx'
import { SITE } from '@/config/editors.ts'
import '@/styles/tokens.css'
import '@/styles/landing.css'
import '@/styles/landing-sections.css'
import '@/styles/explore.css'

const inter = Inter({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-font' })

const handwriting = Patrick_Hand({ subsets: ['latin', 'vietnamese'], display: 'swap', variable: '--erp-script', weight: '400' })

export const metadata: Metadata = {
  metadataBase: new URL(SITE.origin),
  title: { default: `${SITE.name} – soạn văn bản, bảng tính, trình chiếu và PDF miễn phí`, template: `%s | ${SITE.name}` },
  description: SITE.description,
  alternates: { canonical: '/' },
  icons: { icon: '/brand/erpcons-mark.svg', apple: '/brand/icon-192.png' },
  openGraph: { type: 'website', siteName: SITE.name, locale: 'vi_VN', url: '/', images: ['/brand/og-image.png'] },
}

export const viewport: Viewport = { themeColor: '#ffffff', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${inter.variable} ${handwriting.variable}`}>
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
