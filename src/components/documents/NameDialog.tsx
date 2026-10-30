'use client'

import { useId, useState, type FormEvent } from 'react'
import { NAME_MESSAGES, nameError, normalizeName } from '@/lib/documents/names.ts'
import type { Result } from '@/lib/documents/types.ts'
import { Dialog } from './Dialog.tsx'
import { useAction } from './use-action.ts'

export interface NameDialogProps<T> {
  title: string
  label: string
  initial: string
  submitLabel: string
  busyLabel: string
  /** `key` is the Idempotency-Key, the same on a retry of the same name; updates ignore it. */
  send: (name: string, key: string) => Promise<Result<T>>
  onDone: (value: T, name: string) => void
  onClose: () => void
}

/** Create folder, rename and new document: one name field, checked as the server does, server problems below it. */
export function NameDialog<T>({ title, label, initial, submitLabel, busyLabel, send, onDone, onClose }: NameDialogProps<T>) {
  const [value, setValue] = useState(initial)
  const [touched, setTouched] = useState(false)
  const { busy, problem, setProblem, run } = useAction()
  const fieldId = useId()
  const errorId = useId()
  const invalid = nameError(value)
  const message = (touched && invalid ? NAME_MESSAGES[invalid] : null) ?? problem?.message ?? null

  async function submit(event: FormEvent) {
    event.preventDefault()
    setTouched(true)
    if (invalid || busy) return
    const name = normalizeName(value)
    const done = await run(name, (key) => send(name, key))
    if (done !== null) onDone(done, name)
  }

  return <Dialog title={title} onClose={onClose}>
    <form className="erp-docs-dialog__body" onSubmit={submit} noValidate>
      <label className="erp-docs-field__label" htmlFor={fieldId}>{label}</label>
      <input id={fieldId} className="erp-docs-field__input" type="text" value={value} autoFocus autoComplete="off" spellCheck={false}
        maxLength={300} aria-invalid={message ? true : undefined} aria-describedby={message ? errorId : undefined}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => { setValue(event.target.value); setProblem(null) }} />
      <p id={errorId} className="erp-docs-field__error" role="alert">{message}</p>
      <div className="erp-docs-dialog__actions">
        <button type="button" className="erp-btn erp-btn--secondary" onClick={onClose}>Huỷ</button>
        <button type="submit" className="erp-btn erp-btn--primary" disabled={busy} aria-busy={busy}>{busy ? busyLabel : submitLabel}</button>
      </div>
    </form>
  </Dialog>
}
