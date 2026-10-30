// Just enough of IndexedDB for the shell scripts: keyPath stores (one field or a compound array), async callbacks,
// cloned values, and an upgrade transaction that ends before `onsuccess`, as in a browser.
type Row = Record<string, unknown>
type Handler = (() => void) | null
type KeyPath = string | string[]

/** Map key of an IndexedDB key: compound keys compare by their parts. */
const keyOf = (key: unknown) => (Array.isArray(key) ? JSON.stringify(key) : String(key))
const rowKey = (keyPath: KeyPath, row: Row) => keyOf(Array.isArray(keyPath) ? keyPath.map(part => row[part]) : row[keyPath])

class FakeRequest<T> {
  result: T | undefined
  error: { name: string } | null = null
  transaction: UpgradeTransaction | null = null
  onsuccess: Handler = null
  onerror: Handler = null
  onupgradeneeded: ((event: { oldVersion: number; newVersion: number }) => void) | null = null
  onblocked: Handler = null
}

interface Store { keyPath: KeyPath; rows: Map<string, Row> }

function storeApi(store: Store, later: <T>(value: () => T) => FakeRequest<T>, write: (apply: () => void) => FakeRequest<undefined>) {
  return {
    get: (key: unknown) => later(() => { const row = store.rows.get(keyOf(key)); return row && structuredClone(row) }),
    getAll: () => later(() => [...store.rows.values()].map(row => structuredClone(row))),
    // Values are cloned at call time, as the real put does.
    put: (value: Row) => { const copy = structuredClone(value); return write(() => store.rows.set(rowKey(store.keyPath, copy), copy)) },
    delete: (key: unknown) => write(() => store.rows.delete(keyOf(key))),
  }
}

export class FakeIdb {
  stores = new Map<string, Store>()
  /** The next write transactions abort with this error name (e.g. 'QuotaExceededError'). */
  failWrites: string | null = null
  failOpen = false
  version = 0
  writeLock: Promise<void> = Promise.resolve()

  open = (_name: string, version: number) => {
    const request = new FakeRequest<FakeDb>()
    setTimeout(() => {
      if (this.failOpen) { request.error = { name: 'UnknownError' }; request.onerror?.(); return }
      if (version <= this.version) { request.result = new FakeDb(this, null); request.onsuccess?.(); return }
      const oldVersion = this.version
      this.version = version
      const upgrade = new UpgradeTransaction(this)
      request.result = new FakeDb(this, upgrade)
      request.transaction = upgrade
      request.onupgradeneeded?.({ oldVersion, newVersion: version })
      void upgrade.finished().then(() => { request.transaction = null; request.onsuccess?.() })
    })
    return request
  }

  rows(store = 'drafts') {
    return [...(this.stores.get(store)?.rows.values() ?? [])].map(row => structuredClone(row))
  }

  seed(store: string, row: Row) {
    const target = this.stores.get(store)
    target?.rows.set(target.keyPath === 'id' ? String(row.id) : rowKey(target.keyPath, row), structuredClone(row))
  }

  /** A database left by an earlier version of the page: `version` with these stores. */
  preset(version: number, stores: Record<string, { keyPath: KeyPath; rows: Row[] }>) {
    this.version = version
    for (const [name, { keyPath, rows }] of Object.entries(stores)) {
      this.stores.set(name, { keyPath, rows: new Map(rows.map(row => [rowKey(keyPath, row), structuredClone(row)])) })
    }
    return this
  }
}

/** The versionchange transaction: requests answer on later macrotasks, and it ends once none is left. */
class UpgradeTransaction {
  private idb: FakeIdb
  private open = 0
  constructor(idb: FakeIdb) { this.idb = idb }
  objectStore(name: string) {
    const store = this.idb.stores.get(name)
    if (!store) throw new Error('NotFoundError: ' + name)
    const later = <T>(value: () => T) => {
      const request = new FakeRequest<T>()
      this.open += 1
      setTimeout(() => { request.result = value(); request.onsuccess?.(); this.open -= 1 })
      return request
    }
    return storeApi(store, later, apply => later(() => { apply(); return undefined }))
  }
  async finished() {
    const turn = () => new Promise(resolve => setTimeout(resolve))
    do { await turn(); await turn() } while (this.open > 0)
  }
}

class FakeDb {
  private idb: FakeIdb
  private upgrade: UpgradeTransaction | null
  constructor(idb: FakeIdb, upgrade: UpgradeTransaction | null) { this.idb = idb; this.upgrade = upgrade }
  onversionchange: Handler = null
  close() {}
  createObjectStore(name: string, options: { keyPath: KeyPath }) {
    if (!this.upgrade) throw new Error('InvalidStateError: not in an upgrade')
    this.idb.stores.set(name, { keyPath: options.keyPath, rows: new Map() })
    return this.upgrade.objectStore(name)
  }
  deleteObjectStore(name: string) {
    if (!this.upgrade) throw new Error('InvalidStateError: not in an upgrade')
    if (!this.idb.stores.delete(name)) throw new Error('NotFoundError: ' + name)
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
    return storeApi(store, later, write)
  }
}
