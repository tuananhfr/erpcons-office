'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'

let memoryTheme = 'light'
function readTheme() {
  try { return localStorage.getItem('erpcons-office-theme') ?? memoryTheme } catch { return memoryTheme }
}
function subscribe(onChange: () => void) {
  window.addEventListener('erpcons-theme-change', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('erpcons-theme-change', onChange)
    window.removeEventListener('storage', onChange)
  }
}

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribe, readTheme, () => 'light') === 'dark'
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    button.current?.closest<HTMLElement>('.erp-home')?.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])
  function toggle() {
    const theme = dark ? 'light' : 'dark'
    memoryTheme = theme
    try { localStorage.setItem('erpcons-office-theme', theme) } catch {}
    window.dispatchEvent(new Event('erpcons-theme-change'))
  }
  return <button ref={button} className="erp-theme-toggle" type="button" aria-label={dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'} aria-pressed={dark} onClick={toggle}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">{dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.8 14A9 9 0 0 1 10 3.2 9 9 0 1 0 20.8 14Z" />}</svg></button>
}
