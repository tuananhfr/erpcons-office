import Image from 'next/image'
import { Icon } from '@/components/Icon.tsx'
import { EDITORS, editorPath, type EditorSlug } from '@/config/editors.ts'
import { formatSize } from '@/content/landing.ts'
import sizes from '@/generated/editor-sizes.json'

const previews: Record<EditorSlug, string> = {
  'van-ban': 'file-earmark-text',
  'bang-tinh': 'file-earmark-bar-graph',
  'trinh-chieu': 'file-earmark-slides',
  pdf: 'file-earmark-ruled',
}

export function FeatureGrid() {
  const known = sizes as Record<string, number | null>
  return <section id="chuc-nang" className="erp-tools" aria-labelledby="chuc-nang-title">
    <div className="erp-container">
      <h2 id="chuc-nang-title" className="erp-sr-only">Chọn công cụ văn phòng</h2>
      <ul className="erp-features">{EDITORS.map(editor => <li key={editor.slug} className={`erp-feature erp-feature--${editor.slug}`}>
        <a href={editorPath(editor.slug)} target="_blank" rel="noopener" aria-label={`Mở ${editor.name} (tab mới)`} className="erp-feature__link">
          <span className="erp-feature__preview" aria-hidden="true"><Icon name={previews[editor.slug]} /></span>
          <Image className="erp-feature__logo" src={`/brand/office/${editor.slug}.png`} width={96} height={96} alt="" />
          <span className="erp-feature__body"><strong>{editor.name}</strong><span className="erp-feature__ext">{editor.extension.slice(1).toUpperCase()}</span></span>
          <span className="erp-feature__arrow" aria-hidden="true"><Icon name="chevron-right" /></span>
        </a>
        {formatSize(known[editor.slug]) ? <p className="erp-feature__size">Lần đầu tải {formatSize(known[editor.slug])}</p> : null}
      </li>)}</ul>
    </div>
  </section>
}
