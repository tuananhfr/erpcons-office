import { Icon } from '@/components/Icon.tsx'
import type { GuideStep, PlatformGuide } from '@/content/guide.ts'

function Steps({ title, steps }: { title: string; steps: GuideStep[] }) {
  return <div className="erp-guide__steps">
    <h3>{title}</h3>
    <ol>
      {steps.map(step => <li key={step.text}>
        <span>{step.text}</span>
        {step.icon && <span className="erp-guide__step-icon"><Icon name={step.icon} /></span>}
      </li>)}
    </ol>
  </div>
}

export function PlatformSection({ platform }: { platform: PlatformGuide }) {
  const titleId = `${platform.id}-title`
  return <section id={platform.id} className="erp-guide__platform" aria-labelledby={titleId}>
    <header className="erp-guide__platform-head">
      <span className="erp-guide__platform-icon"><Icon name={platform.icon} /></span>
      <div>
        <h2 id={titleId}>{platform.name}</h2>
        <p>{platform.browsers}</p>
      </div>
    </header>
    <div className="erp-guide__columns">
      <Steps title="Cài ứng dụng" steps={platform.install} />
      <Steps title="Mở tệp" steps={platform.open} />
    </div>
    {platform.note && <p className="erp-guide__note"><Icon name="info-circle" /><span>{platform.note}</span></p>}
  </section>
}
