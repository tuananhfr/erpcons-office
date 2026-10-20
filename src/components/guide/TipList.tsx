import { Icon } from '@/components/Icon.tsx'

export function TipList({ id, title, items, alt = false }: { id: string; title: string; items: { icon: string; title: string; text: string }[]; alt?: boolean }) {
  return <section className={alt ? 'erp-section erp-section--alt' : 'erp-section'} aria-labelledby={id}>
    <div className="erp-container">
      <h2 id={id}>{title}</h2>
      <ul className="erp-guide__tips">
        {items.map(item => <li key={item.title}>
          <span className="erp-guide__tip-icon"><Icon name={item.icon} /></span>
          <div><h3>{item.title}</h3><p>{item.text}</p></div>
        </li>)}
      </ul>
    </div>
  </section>
}
