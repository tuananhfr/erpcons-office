'use client'

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from 'react'
import { DEFERRED_PROMPT_KEY, installMode, type BeforeInstallPromptEvent, type InstallMode } from '@/lib/pwa/install-prompt.ts'

type PromptWindow = Window & { [DEFERRED_PROMPT_KEY]?: BeforeInstallPromptEvent | null }
const STANDALONE = '(display-mode: standalone)'

function readMode(): InstallMode {
  return installMode({
    standalone: matchMedia(STANDALONE).matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    hasPrompt: Boolean((window as PromptWindow)[DEFERRED_PROMPT_KEY]),
  })
}

function subscribe(onChange: () => void): () => void {
  const installed = () => {
    (window as PromptWindow)[DEFERRED_PROMPT_KEY] = null
    onChange()
  }
  const media = matchMedia(STANDALONE)
  window.addEventListener('erp-install-ready', onChange)
  window.addEventListener('appinstalled', installed)
  media.addEventListener('change', onChange)
  return () => {
    window.removeEventListener('erp-install-ready', onChange)
    window.removeEventListener('appinstalled', installed)
    media.removeEventListener('change', onChange)
  }
}

export function InstallAppButton({ variant, icon, shareIcon }: { variant: 'header' | 'menu'; icon: ReactNode; shareIcon: ReactNode }) {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'hidden' as const)
  const [hintOpen, setHintOpen] = useState(false)
  const hintId = useId()

  useEffect(() => {
    if (!hintOpen) return
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setHintOpen(false) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [hintOpen])

  if (mode === 'hidden') return null

  async function install() {
    if (mode === 'ios-hint') {
      setHintOpen((open) => !open)
      return
    }
    const w = window as PromptWindow
    const prompt = w[DEFERRED_PROMPT_KEY]
    if (!prompt) return
    // A prompt event can be shown only once; Chrome fires a fresh one if the user dismisses it.
    w[DEFERRED_PROMPT_KEY] = null
    window.dispatchEvent(new Event('erp-install-ready'))
    await prompt.prompt()
  }

  const ios = mode === 'ios-hint'
  return <div className={`erp-install erp-install--${variant}`}>
    <button type="button" className="erp-install__button" onClick={install}
      aria-expanded={ios ? hintOpen : undefined} aria-controls={ios ? hintId : undefined}>
      {icon}Cài ứng dụng
    </button>
    {ios && hintOpen && <p id={hintId} className="erp-install__hint">
      Trong Safari, bấm {shareIcon} <b>Chia sẻ</b> rồi chọn <b>Thêm vào MH chính</b>.
    </p>}
  </div>
}
