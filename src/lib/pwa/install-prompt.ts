export type InstallMode = 'hidden' | 'prompt' | 'ios-hint'

export interface InstallEnv {
  standalone: boolean
  userAgent: string
  maxTouchPoints: number
  /** Chrome/Edge fired `beforeinstallprompt`, so the site is installable right now. */
  hasPrompt: boolean
}

/** Chrome's event, not yet in lib.dom. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// iPadOS 13+ reports a desktop Mac user agent; touch points are what give it away.
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

export function installMode(env: InstallEnv): InstallMode {
  if (env.standalone) return 'hidden'
  if (env.hasPrompt) return 'prompt'
  // iOS has no install API; Add to Home Screen from the Share menu is the only way.
  if (isAppleMobile(env.userAgent, env.maxTouchPoints)) return 'ios-hint'
  return 'hidden'
}

/** Global the early capture script stores Chrome's prompt in. */
export const DEFERRED_PROMPT_KEY = '__erpInstallPrompt'

// Chrome can fire beforeinstallprompt before React hydrates; an inline script in <body> keeps it for the button.
export const CAPTURE_INSTALL_PROMPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.${DEFERRED_PROMPT_KEY}=e;window.dispatchEvent(new Event('erp-install-ready'))})`
