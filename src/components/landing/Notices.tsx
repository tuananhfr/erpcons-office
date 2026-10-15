import { Icon } from '@/components/Icon.tsx'
import { NOTICES } from '@/content/landing.ts'

export function Notices() {
  return (
    <section className="erp-section" aria-labelledby="luu-y-title">
      <div className="erp-container">
        <h2 id="luu-y-title">Lưu ý</h2>
        <ul className="erp-notices">
          {NOTICES.map((text) => (
            <li key={text}><Icon name="info-circle" /><span>{text}</span></li>
          ))}
        </ul>
      </div>
    </section>
  )
}
