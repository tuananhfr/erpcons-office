import { Icon } from '@/components/Icon.tsx'
import { SITE } from '@/config/editors.ts'
import { WHY } from '@/content/landing.ts'

export function WhyUse() {
  return (
    <section className="erp-section erp-section--alt" aria-labelledby="vi-sao-title">
      <div className="erp-container">
        <h2 id="vi-sao-title">Vì sao dùng {SITE.name}</h2>
        <ul className="erp-why">
          {WHY.map((item) => (
            <li key={item.title}>
              <span className="erp-why__icon"><Icon name={item.icon} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
