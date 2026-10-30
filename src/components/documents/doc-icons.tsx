import { Icon } from '@/components/Icon.tsx'
import type { DocIcons } from './IconsContext.tsx'
import { DOC_ICONS, type DocIconName } from './icon-names.ts'

/** The documents pages' icons, rendered from bootstrap-icons at build time (server code: Icon reads the SVG files). */
export const docIcons = Object.fromEntries(
  (Object.keys(DOC_ICONS) as DocIconName[]).map((name) => [name, <Icon key={name} name={DOC_ICONS[name]} />]),
) as DocIcons
