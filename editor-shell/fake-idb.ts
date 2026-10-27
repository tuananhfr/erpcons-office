// Just enough of IndexedDB for the shell scripts: one keyPath store per name, async callbacks, cloned values.
type Row = Record<string, unknown>
type Handler = (() => void) | null

class FakeRequest<T> {
  result: T | undefined
  error: { name: string } | null = null
  onsuccess: Handler = null
  onerror: Handler = null
  onupgradeneeded: Handler = null
  onblocked: Handler = null
}

export class FakeIdb {
  stores = new Map<string, { keyPath: string; rows: Map<string, Row> }>()
  /** The next write transactions abort with this error name (e.g. 'QuotaExceededError'). */
  failWrites: string | null = null
  failOpen = false
  version = 0
  writeLock: Promise<void> = Promise.resolve()

  open = (_name: string, version: number) => {
    const request = new FakeRequest<FakeDb>()
    setTimeout(() => {
      if (this.failOpen) { request.error = { name: 'UnknownError' }; request.onerror?.(); return }
      request.result = new FakeDb(this)
      if (version > this.version) { this.version = version; request.onupgradeneeded?.() }
      request.onsuccess?.()
    })
    return request
  }

  rows(store = 'drafts') {
    return [...(this.stores.get(store)?.rows.values() ?? [])].map(row => structuredClone(row))
  }

  seed(store: string, row: Row) {
    this.stores.get(store)?.rows.set(String(row.id), structuredClone(row))
  }
}

class FakeDb {
  private idb: FakeIdb
  constructor(idb: FakeIdb) { this.idb = idb }
  onversionchange: Handler = null
  close() {}
  createObjectStore(name: string, options: { keyPath: string }) {
    this.idb.stores.set(name, { keyPath: options.keyPath, rows: new Map() })
  }
  transaction(name: string, mode: 'readonly' | 'readwrite' = 'readonly') {
    return new FakeTransaction(this.idb, name, mode)
  }
}

class FakeTransaction {
  oncomplete: Handler = null
  onabort: Handler = null
  onerror: Handler = null
  error: { name: string } | null = null
  private writes: (() => void)[] = []
  private idb: FakeIdb
  private name: string
  private mode: string

  private started: Promise<void>

  constructor(idb: FakeIdb, name: string, mode: string) {
    this.idb = idb
    this.name = name
    this.mode = mode
    const failure = mode === 'readwrite' ? idb.failWrites : null
    // Like a browser, a readwrite transaction waits for the previous one on the database to finish.
    let release = () => {}
    this.started = mode === 'readwrite' ? idb.writeLock : Promise.resolve()
    if (mode === 'readwrite') idb.writeLock = new Promise<void>((resolve) => { release = resolve })
    // Requests are made right after the transaction; it only completes once they have answered.
    void this.started.then(() => setTimeout(() => setTimeout(() => {
      if (failure) { this.error = { name: failure }; this.onabort?.(); release(); return }
      this.writes.forEach(apply => apply())
      this.oncomplete?.()
      release()
    })))
  }

  objectStore(name: string) {
    const store = this.idb.stores.get(name)
    if (!store || name !== this.name) throw new Error('NotFoundError: ' + name)
    const later = <T>(value: () => T) => {
      const request = new FakeRequest<T>()
      void this.started.then(() => setTimeout(() => { request.result = value(); request.onsuccess?.() }))
      return request
    }
    const write = (apply: () => void) => {
      if (this.mode !== 'readwrite') throw new Error('ReadOnlyError')
      this.writes.push(apply)
      return later(() => undefined)
    }
    return {
      get: (key: string) => later(() => { const row = store.rows.get(key); return row && structuredClone(row) }),
      getAll: () => later(() => [...store.rows.values()].map(row => structuredClone(row))),
      // Values are cloned at call time, as the real put does.
      put: (value: Row) => { const copy = structuredClone(value); return write(() => store.rows.set(String(copy[store.keyPath]), copy)) },
      delete: (key: string) => write(() => store.rows.delete(key)),
    }
  }
}
