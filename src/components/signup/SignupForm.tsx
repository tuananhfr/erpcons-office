'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { signupStatus, submitSignup } from '@/lib/signup/api.ts'
import {
  FIELD_ORDER, fieldError, normalizeEmail, PASSWORD_MIN_CHARS, validateSignup,
  type FieldErrors, type SignupField, type SignupForm as Form,
} from '@/lib/signup/rules.ts'
import { SignupPanel, type SignupIcons } from './SignupPanel.tsx'

const IDS: Record<SignupField, string> = { name: 'dang-ky-ho-ten', email: 'dang-ky-email', password: 'dang-ky-mat-khau' }
// The server names the field but its text is generic; these fit a field that passed the page's own rules.
const FALLBACK: Record<SignupField, string> = {
  name: 'Họ tên chưa hợp lệ.',
  email: 'Email này chưa dùng được để đăng ký. Kiểm tra lại địa chỉ.',
  password: 'Mật khẩu chưa hợp lệ.',
}
const EMPTY: Form = { name: '', email: '', password: '' }

type Phase = { kind: 'form' } | { kind: 'sent'; email: string } | { kind: 'closed'; message: string; announce: boolean }

function Field({ field, label, hint, error, children }: {
  field: SignupField
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return <div className="erp-signup__field" data-invalid={error ? 'true' : undefined}>
    <label className="erp-signup__label" htmlFor={IDS[field]}>{label}</label>
    {children}
    {hint && <p id={`${IDS[field]}-goi-y`} className="erp-signup__hint">{hint}</p>}
    {error && <p id={`${IDS[field]}-loi`} className="erp-signup__error">{error}</p>}
  </div>
}

const describedBy = (field: SignupField, error: string | undefined, hint = false) =>
  [hint ? `${IDS[field]}-goi-y` : null, error ? `${IDS[field]}-loi` : null].filter(Boolean).join(' ') || undefined

/** The form card and, beside it, `aside`; the aside is about what follows a sign-up, so a closed server drops it. */
export function SignupForm({ icons, aside }: { icons: SignupIcons; aside: ReactNode }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [touched, setTouched] = useState<Partial<Record<SignupField, true>>>({})
  const [summaryTurn, setSummaryTurn] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const trap = useRef<HTMLInputElement>(null)
  const summary = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    void signupStatus().then((status) => {
      if (live && status === 'closed') setPhase({ kind: 'closed', message: 'ERPCons Văn phòng chưa mở đăng ký tài khoản mới.', announce: false })
    })
    return () => { live = false }
  }, [])

  useEffect(() => { if (summaryTurn) summary.current?.focus() }, [summaryTurn])

  const update = (field: SignupField, value: string) => {
    const next = { ...form, [field]: value }
    setForm(next)
    // Re-check only what the person already left once, so nothing turns red while they are still typing.
    const recheck = FIELD_ORDER.filter((name) => touched[name] && (name === field || (field === 'email' && name === 'password')))
    if (!recheck.length) return
    setErrors((current) => {
      const updated = { ...current }
      for (const name of recheck) {
        const error = fieldError(name, next)
        if (error) updated[name] = error
        else delete updated[name]
      }
      return updated
    })
  }

  const leave = (field: SignupField) => {
    if (!form[field] && !touched[field]) return
    setTouched((current) => ({ ...current, [field]: true }))
    const error = fieldError(field, form)
    setErrors((current) => {
      const updated = { ...current }
      if (error) updated[field] = error
      else delete updated[field]
      return updated
    })
  }

  const showErrors = (found: FieldErrors) => {
    setErrors(found)
    setTouched({ name: true, email: true, password: true })
    setSummaryTurn((turn) => turn + 1)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setNotice(null)
    const found = validateSignup(form)
    if (Object.keys(found).length) { showErrors(found); return }
    setBusy(true)
    const result = await submitSignup({ ...form, website: trap.current?.value ?? '' })
    setBusy(false)
    switch (result.kind) {
      case 'accepted':
        setForm((current) => ({ ...current, password: '' }))
        setPhase({ kind: 'sent', email: normalizeEmail(form.email) })
        return
      case 'invalid':
        if (result.field) showErrors({ [result.field]: fieldError(result.field, form) ?? FALLBACK[result.field] })
        else setNotice(result.message)
        return
      case 'closed':
        setPhase({ kind: 'closed', message: result.message, announce: true })
        return
      default:
        setNotice(result.message)
    }
  }

  const layout = (card: ReactNode, withAside = true) => <div className="erp-signup__layout">
    <div className="erp-signup__card">{card}</div>
    {withAside && aside}
  </div>

  if (phase.kind === 'sent') {
    return layout(<SignupPanel icon={icons.sent} tone="success" title="Kiểm tra hộp thư của bạn"
      actions={<button type="button" className="erp-btn erp-btn--secondary" onClick={() => { setShowPassword(false); setPhase({ kind: 'form' }) }}>Đăng ký lại</button>}>
      <p>Nếu <strong className="erp-signup__email">{phase.email}</strong> dùng được để đăng ký, email xác minh đang trên đường tới. Mở liên kết trong email trong vòng 48 giờ để tạo tài khoản.</p>
      <p>Không thấy email sau vài phút? Xem thư mục Spam hoặc Quảng cáo, rồi đăng ký lại. Mỗi email mới làm liên kết cũ hết hiệu lực.</p>
    </SignupPanel>)
  }

  if (phase.kind === 'closed') {
    return layout(<SignupPanel icon={icons.closed} title="Chưa mở đăng ký" announce={phase.announce}
      // eslint-disable-next-line @next/next/no-html-link-for-pages -- static hosting, full navigation
      actions={<a className="erp-btn erp-btn--secondary" href="/">Dùng bản Free</a>}>
      <p>{phase.message}</p>
      <p>Bản Free vẫn dùng được ngay, không cần tài khoản.</p>
    </SignupPanel>, false)
  }

  const listed = FIELD_ORDER.filter((field) => errors[field])
  return layout(<form className="erp-signup__form" noValidate onSubmit={(event) => { void submit(event) }} aria-busy={busy || undefined}>
    {summaryTurn > 0 && listed.length > 0 && <div ref={summary} className="erp-signup__summary" role="alert" tabIndex={-1}>
      <h2 className="erp-signup__summary-title">{icons.alert}Kiểm tra lại {listed.length > 1 ? `${listed.length} mục` : 'thông tin'}</h2>
      <ul>{listed.map((field) => <li key={field}>
        <a href={`#${IDS[field]}`} onClick={(event) => { event.preventDefault(); document.getElementById(IDS[field])?.focus() }}>{errors[field]}</a>
      </li>)}</ul>
    </div>}

    <Field field="name" label="Họ và tên" error={errors.name}>
      <input id={IDS.name} name="name" className="erp-signup__input" type="text" autoComplete="name" autoCapitalize="words"
        value={form.name} aria-invalid={errors.name ? true : undefined} aria-describedby={describedBy('name', errors.name)}
        onChange={(event) => update('name', event.target.value)} onBlur={() => leave('name')} />
    </Field>

    <Field field="email" label="Email" hint="Dùng để đăng nhập PI ID và nhận email xác minh." error={errors.email}>
      <input id={IDS.email} name="email" className="erp-signup__input" type="email" inputMode="email" autoComplete="email"
        autoCapitalize="none" spellCheck={false} value={form.email} aria-invalid={errors.email ? true : undefined}
        aria-describedby={describedBy('email', errors.email, true)}
        onChange={(event) => update('email', event.target.value)} onBlur={() => leave('email')} />
    </Field>

    <Field field="password" label="Mật khẩu" hint={`Ít nhất ${PASSWORD_MIN_CHARS} ký tự, khác với email.`} error={errors.password}>
      <div className="erp-signup__password">
        <input id={IDS.password} name="password" className="erp-signup__input" type={showPassword ? 'text' : 'password'}
          autoComplete="new-password" autoCapitalize="none" spellCheck={false} value={form.password}
          aria-invalid={errors.password ? true : undefined} aria-describedby={describedBy('password', errors.password, true)}
          onChange={(event) => update('password', event.target.value)} onBlur={() => leave('password')} />
        <button type="button" className="erp-signup__reveal" aria-controls={IDS.password} aria-pressed={showPassword}
          aria-label="Hiện mật khẩu" onClick={() => setShowPassword((value) => !value)}>
          {showPassword ? icons.hide : icons.show}
        </button>
      </div>
    </Field>

    {/* Hidden from people and assistive tech; a bot that fills it gets the usual answer and nothing is sent. */}
    <div className="erp-signup__trap" aria-hidden="true">
      <label htmlFor="dang-ky-website">Website</label>
      <input ref={trap} id="dang-ky-website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>

    {notice && <p className="erp-signup__notice" role="alert">{icons.alert}{notice}</p>}

    <button type="submit" className="erp-btn erp-btn--primary erp-signup__submit" disabled={busy} aria-busy={busy || undefined}>
      {busy ? 'Đang gửi…' : 'Tạo tài khoản'}
    </button>
  </form>)
}
