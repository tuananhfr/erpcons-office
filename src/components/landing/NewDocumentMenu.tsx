import Image from 'next/image'
import { EDITORS, editorPath } from '@/config/editors.ts'
import { Icon } from '@/components/Icon.tsx'

export function NewDocumentMenu() {
  return <details className="erp-new-document">
    <summary className="erp-btn erp-btn--secondary"><Icon name="plus-lg" /> Tạo tài liệu mới</summary>
    <div className="erp-new-document__panel">
      <p>Bắt đầu với tài liệu trống</p>
      {EDITORS.map(editor => <a key={editor.slug} href={editorPath(editor.slug)} target="_blank" rel="noopener">
        <Image src={`/brand/office/${editor.slug}-new.png`} alt="" width={32} height={36} />
        <span>{editor.name}<small>{editor.extension.slice(1).toUpperCase()} · Mở trong tab mới</small></span>
        <Icon name="arrow-up-right" />
      </a>)}
    </div>
  </details>
}
