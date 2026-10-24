// Node fakes for the browser pieces account.js shares between tabs: a manual clock, localStorage with storage
// events, BroadcastChannel and the Web Locks API. Cross-tab deliveries are async, as in browsers.

const nextTask = () => new Promise<void>(resolve => setImmediate(resolve))

/** Lets promise chains, fake deliveries and real WebCrypto finish. */
export async function settle(rounds = 40): Promise<void> {
  for (let i = 0; i < rounds; i++) await nextTask()
}

interface Timer { id: number; at: number; fn: () => void; every: number | null }

export class ManualClock {
  now: number
  private timers: Timer[] = []
  private seq = 0
  constructor(start = Date.UTC(2026, 9, 24, 8)) { this.now = start }
  setTimeout = (fn: () => void, ms = 0) => this.add(fn, ms, null)
  setInterval = (fn: () => void, ms = 0) => this.add(fn, ms, Math.max(1, ms))
  clearTimeout = (id?: number) => { this.timers = this.timers.filter(t => t.id !== id) }
  clearInterval = (id?: number) => this.clearTimeout(id)
  pending(): number { return this.timers.length }
  private add(fn: () => void, ms: number, every: number | null): number {
    const id = ++this.seq
    this.timers.push({ id, at: this.now + Math.max(0, ms), fn, every })
    return id
  }
  /** Moves time forward, firing due timers in order. */
  advance(ms: number): void {
    const end = this.now + ms
    for (;;) {
      const due = this.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0]
      if (!due) break
      this.now = due.at
      if (due.every) due.at += due.every
      else this.timers = this.timers.filter(t => t !== due)
      due.fn()
    }
    this.now = end
  }
}

export class MemoryStorage {
  map = new Map<string, string>()
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
  removeItem(key: string) { this.map.delete(key) }
  clear() { this.map.clear() }
  get length() { return this.map.size }
  key(index: number) { return [...this.map.keys()][index] ?? null }
}

type StorageListener = (event: { key: string | null; oldValue: string | null; newValue: string | null }) => void

/** One origin's localStorage; writes notify every other tab, never the writer. */
export class SharedStorage {
  map = new Map<string, string>()
  private tabs = new Map<object, StorageListener>()
  writes = 0
  view(tab: object, onEvent: StorageListener): MemoryStorage {
    this.tabs.set(tab, onEvent)
    const notify = (key: string, oldValue: string | null, newValue: string | null) => {
      for (const [other, listener] of this.tabs) {
        if (other !== tab) void nextTask().then(() => listener({ key, oldValue, newValue }))
      }
    }
    const map = this.map
    const shared = this as SharedStorage
    return Object.assign(new MemoryStorage(), {
      map,
      setItem(key: string, value: string) {
        const old = map.get(key) ?? null
        map.set(key, String(value))
        shared.writes += 1
        notify(key, old, String(value))
      },
      removeItem(key: string) {
        if (!map.has(key)) return
        const old = map.get(key)!
        map.delete(key)
        shared.writes += 1
        notify(key, old, null)
      },
    })
  }
  json<T = Record<string, unknown>>(key: string): T | null {
    const raw = this.map.get(key)
    return raw ? JSON.parse(raw) as T : null
  }
}

interface Channel { name: string; closed: boolean; deliver: (data: unknown) => void }

export class ChannelHub {
  channels: Channel[] = []
  posted: unknown[] = []
  /** A BroadcastChannel class whose instances talk through this hub. */
  channelClass(): unknown {
    const hub = this as ChannelHub
    return class FakeBroadcastChannel {
      name: string
      closed = false
      onmessage: ((event: { data: unknown }) => void) | null = null
      private listeners: ((event: { data: unknown }) => void)[] = []
      constructor(name: string) {
        this.name = name
        hub.channels.push(this as unknown as Channel)
      }
      deliver(data: unknown) {
        const event = { data: structuredClone(data) }
        this.onmessage?.(event)
        this.listeners.forEach(fn => fn(event))
      }
      addEventListener(type: string, fn: (event: { data: unknown }) => void) { if (type === 'message') this.listeners.push(fn) }
      postMessage(data: unknown) {
        hub.posted.push(structuredClone(data))
        for (const other of hub.channels) {
          if (other !== (this as unknown as Channel) && other.name === this.name && !other.closed) void nextTask().then(() => other.deliver(data))
        }
      }
      close() { this.closed = true }
    }
  }
}

/** navigator.locks shared by every tab of the origin: exclusive locks granted in request order. */
export class SharedLocks {
  private tails = new Map<string, Promise<unknown>>()
  requests: string[] = []
  request(name: string, optionsOrCallback: unknown, maybeCallback?: unknown): Promise<unknown> {
    const callback = (typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback) as (lock: { name: string }) => unknown
    this.requests.push(name)
    const previous = this.tails.get(name) ?? Promise.resolve()
    const run = previous.then(() => nextTask()).then(() => callback({ name }))
    this.tails.set(name, run.then(() => undefined, () => undefined))
    return run
  }
}
