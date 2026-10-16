import { describe, expect, it } from 'vitest'
import { installMode, isAppleMobile } from './install-prompt.ts'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'
const FIREFOX_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'

describe('isAppleMobile', () => {
  it('recognises iPhone and iPad, including iPadOS that reports itself as a Mac', () => {
    expect(isAppleMobile(IPHONE, 5)).toBe(true)
    expect(isAppleMobile(IPAD_DESKTOP_UA, 5)).toBe(true)
  })

  it('does not treat a real Mac or Android as Apple mobile', () => {
    expect(isAppleMobile(IPAD_DESKTOP_UA, 0)).toBe(false)
    expect(isAppleMobile(ANDROID_CHROME, 5)).toBe(false)
  })
})

describe('installMode', () => {
  const base = { standalone: false, userAgent: FIREFOX_DESKTOP, maxTouchPoints: 0, hasPrompt: false }

  it('offers the browser prompt once Chrome/Edge says the app can be installed', () => {
    expect(installMode({ ...base, userAgent: ANDROID_CHROME, hasPrompt: true })).toBe('prompt')
  })

  it('explains Add to Home Screen on iOS, which has no install prompt API', () => {
    expect(installMode({ ...base, userAgent: IPHONE, maxTouchPoints: 5 })).toBe('ios-hint')
  })

  it('hides the button when already running as the installed app', () => {
    expect(installMode({ ...base, standalone: true, hasPrompt: true })).toBe('hidden')
    expect(installMode({ ...base, standalone: true, userAgent: IPHONE, maxTouchPoints: 5 })).toBe('hidden')
  })

  it('hides the button where installing is not possible', () => {
    expect(installMode(base)).toBe('hidden')
  })
})
