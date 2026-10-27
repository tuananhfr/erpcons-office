import type { Metadata } from 'next'
import { Icon } from '@/components/Icon.tsx'
import { BatchIntake } from '@/components/intake/BatchIntake.tsx'
import type { BatchIcons } from '@/components/intake/BatchList.tsx'
import { SiteFooter } from '@/components/landing/SiteFooter.tsx'
import { SiteHeader } from '@/components/landing/SiteHeader.tsx'
import { EDITORS } from '@/config/editors.ts'
import { INTAKE_SEO } from '@/lib/seo/page-seo.ts'
import { pageMetadata } from '@/lib/seo/metadata.ts'

// Only reached from the share target with a device-local ?batch= id: nothing here to index.
export const metadata: Metadata = { ...pageMetadata(INTAKE_SEO), robots: { index: false, follow: false } }

const icons: BatchIcons = {
  editors: Object.fromEntries(EDITORS.map((editor) => [editor.slug, <Icon key={editor.slug} name={editor.icon} />])),
  tones: {
    ready: <Icon name="file-earmark" />,
    progress: <Icon name="hourglass" />,
    done: <Icon name="check2-circle" />,
    warn: <Icon name="exclamation-triangle" />,
    error: <Icon name="x-circle" />,
    muted: <Icon name="clock-history" />,
  },
  refused: <Icon name="file-earmark-x" />,
  open: <Icon name="arrow-right" />,
  retry: <Icon name="arrow-clockwise" />,
  cancel: <Icon name="trash" />,
}

export default function IntakePage() {
  return <><SiteHeader /><main id="noi-dung" className="erp-container">
    <BatchIntake icons={icons} noticeIcon={<Icon name="inbox" />} pickIcon={<Icon name="folder2-open" />} />
  </main><SiteFooter /></>
}
