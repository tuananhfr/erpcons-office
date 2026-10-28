import { buildFlags, type BuildFlags } from './online.ts'

/**
 * Flags of the Next pages, read at build time in server code only. They follow the same local override as
 * assemble.mts, so a local online build gets sign-in and /tai-lieu/ on the landing side too.
 */
export function siteFlags(env: Readonly<Record<string, string | undefined>> = process.env): BuildFlags {
  return buildFlags(env, process.argv)
}

/** Routes written as `page.online.tsx` (only /tai-lieu/) exist in a build only with online documents on. */
export const ONLINE_PAGE_EXTENSION = 'online.tsx'

export function pageExtensions(online: boolean): string[] {
  return online ? ['tsx', 'ts', ONLINE_PAGE_EXTENSION] : ['tsx', 'ts']
}
