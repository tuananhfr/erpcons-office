export interface WorkerContainer {
  controller: { postMessage: (message: { type: 'erpcons-warm'; urls: string[] }) => void } | null
  addEventListener: (type: 'controllerchange', listener: () => void) => void
}

export interface WarmUpEnv {
  href: string
  loaded: () => string[]
  observe: (onLoaded: (urls: string[]) => void) => void
}

/** Same contract as editor-shell/shell.js: the page reaches the worker only after it already loaded. */
export function startWarmUp(container: WorkerContainer, env: WarmUpEnv): void {
  const send = (urls: string[]) => container.controller?.postMessage({ type: 'erpcons-warm', urls })
  const sendAll = () => send([env.href, ...env.loaded()])
  container.addEventListener('controllerchange', sendAll)
  env.observe(send)
  sendAll()
}

export function browserWarmUpEnv(): WarmUpEnv {
  return {
    href: location.href,
    loaded: () => performance.getEntriesByType('resource').map((e) => e.name),
    observe: (onLoaded) => {
      if (typeof PerformanceObserver === 'undefined') return
      new PerformanceObserver((list) => onLoaded(list.getEntries().map((e) => e.name))).observe({ type: 'resource' })
    },
  }
}
