import type { NextConfig } from 'next'
import { pageExtensions, siteFlags } from './src/config/site-flags.ts'

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // With online documents off Next never sees the /tai-lieu/ route, so neither its page nor its code is built.
  pageExtensions: pageExtensions(siteFlags().online),
  // CLAUDE.md is maintained by hand; `next dev` would otherwise append its own block to it.
  agentRules: false,
}

export default config
