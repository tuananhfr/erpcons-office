import fs from 'node:fs'
import path from 'node:path'

// Read at build time: the site is a static export, so there is no fs at runtime.
const ICONS_DIR = path.join(process.cwd(), 'node_modules', 'bootstrap-icons', 'icons')
const NAME = /^[a-z0-9-]+$/

export function Icon({ name, label }: { name: string; label?: string }) {
  if (!NAME.test(name)) throw new Error(`invalid icon name: ${name}`)
  const svg = fs.readFileSync(path.join(ICONS_DIR, `${name}.svg`), 'utf8')
    .replace('<svg ', `<svg class="erp-icon" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false" `)
  return <span className="erp-icon-wrap" dangerouslySetInnerHTML={{ __html: svg }} />
}
