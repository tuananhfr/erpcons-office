import { Icon } from '@/components/Icon.tsx'
import { EDITORS, editorPath } from '@/config/editors.ts'
import { formatSize } from '@/content/landing.ts'
import sizes from '@/generated/editor-sizes.json'

export function FeatureGrid() {
  const known = sizes as Record<string, number | null>
  return (
    <section id="chuc-nang" className="erp-section" aria-labelledby="chuc-nang-title">
      <div className="erp-container">
        <h2 id="chuc-nang-title">Chức năng</h2>
        <ul className="erp-features">
          {EDITORS.map((editor) => {
            const size = formatSize(known[editor.slug])
            return (
              <li key={editor.slug} className="erp-feature">
                <span className="erp-feature__icon"><Icon name={editor.icon} /></span>
                <h3>{editor.name} <span className="erp-feature__ext">{editor.extension}</span></h3>
                <p>{editor.summary}</p>
                {size ? <p className="erp-feature__size">Lần đầu tải {size}</p> : null}
                <a className="erp-btn erp-btn--secondary" href={editorPath(editor.slug)}>Mở {editor.name}</a>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
