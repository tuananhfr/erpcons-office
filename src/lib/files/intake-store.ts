import { INTAKE_DB, INTAKE_STORE, type IntakeRecord } from './intake-contract.ts'

// The /nhan-tep/ page's view of the queue sw.js fills (editor-shell/intake.js is the shell-side twin).

function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(INTAKE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(INTAKE_STORE, { keyPath: 'id' })
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('blocked'))
    request.onsuccess = () => resolve(request.result)
  })
}

function run<T>(factory: IDBFactory, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  return openDb(factory).then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(INTAKE_STORE, 'readwrite')
    let result: T
    work(transaction.objectStore(INTAKE_STORE), (value) => { result = value })
    transaction.oncomplete = () => { db.close(); resolve(result) }
    transaction.onabort = () => { db.close(); reject(transaction.error) }
  }))
}

function inBatch(rows: IntakeRecord[], batchId: string): IntakeRecord[] {
  return rows
    .filter((row) => row.batchId === batchId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0))
}

/**
 * The batch's records in share order, bytes included. Expired entries of other batches are deleted on the way; this
 * batch's keep their metadata (without bytes) once, so the page can say "expired" rather than "not found".
 */
export function readBatch(batchId: string, factory: IDBFactory = indexedDB, now = Date.now()): Promise<IntakeRecord[]> {
  return run<IntakeRecord[]>(factory, (store, done) => {
    const all = store.getAll()
    all.onsuccess = () => {
      const rows = all.result as IntakeRecord[]
      for (const row of rows) {
        if (!(row.expiresAt < now)) continue
        if (row.batchId !== batchId) store.delete(row.id)
        else if (row.file) { delete row.file; store.put(row) }
      }
      done(inBatch(rows, batchId))
    }
  })
}

/** READY → ROUTED just before leaving for the editor; never downgrades a state the editor already wrote. */
export function markRouted(ids: readonly string[], factory: IDBFactory = indexedDB): Promise<void> {
  return run<void>(factory, (store) => {
    for (const id of ids) {
      const read = store.get(id)
      read.onsuccess = () => {
        const row = read.result as IntakeRecord | undefined
        if (row && (row.state === 'READY' || row.state === undefined)) store.put({ ...row, state: 'ROUTED' })
      }
    }
  })
}

/** "Hủy": removes every record of the batch, bytes included. */
export function deleteBatch(batchId: string, factory: IDBFactory = indexedDB): Promise<void> {
  return run<void>(factory, (store) => {
    const all = store.getAll()
    all.onsuccess = () => {
      for (const row of inBatch(all.result as IntakeRecord[], batchId)) store.delete(row.id)
    }
  })
}
