import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  // CLAUDE.md is maintained by hand; `next dev` would otherwise append its own block to it.
  agentRules: false,
}

export default config
