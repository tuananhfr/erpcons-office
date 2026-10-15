import { FAQ } from '@/content/landing.ts'

export function Faq() {
  return (
    <section className="erp-section erp-section--alt" aria-labelledby="hoi-dap-title">
      <div className="erp-container">
        <h2 id="hoi-dap-title">Câu hỏi thường gặp</h2>
        <div className="erp-faq">
          {FAQ.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
