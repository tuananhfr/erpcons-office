import type { MetadataRoute } from 'next'
import { webManifest } from '@/lib/pwa/web-manifest.ts'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return webManifest()
}
