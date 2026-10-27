import { editorPath, type EditorSlug } from '../../config/editors.ts'
import {
  INTAKE_DB, INTAKE_LIMITS, INTAKE_STORE, editorForName, extensionOf, intakeCode, intakeMessage, signatureFailure,
  type IntakeReason, type IntakeRecord,
} from './intake-contract.ts'

export const MAX_FILE_SIZE = INTAKE_LIMITS.maxFileBytes
export const FILE_DB = INTAKE_DB
export const FILE_STORE = INTAKE_STORE

/** An error whose message is the contract's sentence for `reason` (with its code). */
export class IntakeFailure extends Error {
  readonly reason: IntakeReason
  readonly code: string
  constructor(reason: IntakeReason) {
    super(intakeMessage(reason))
    this.reason = reason
    this.code = intakeCode(reason)
  }
}

export function editorForFile(name: string): EditorSlug | undefined {
  return editorForName(name)
}

export function validateFile(file: Pick<File, 'name' | 'size'>): EditorSlug {
  const editor = editorForFile(file.name)
  if (!editor) throw new IntakeFailure('unsupported')
  if (!file.size) throw new IntakeFailure('empty')
  if (file.size > MAX_FILE_SIZE) throw new IntakeFailure('tooLarge')
  return editor
}

/** Rejects a file whose first KB contradicts its extension, as the share target does. */
export async function checkSignature(file: Pick<File, 'name' | 'slice'>): Promise<void> {
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, INTAKE_LIMITS.headBytes).arrayBuffer())
  } catch {
    throw new IntakeFailure('unreadableFile')
  }
  const failure = signatureFailure(extensionOf(file.name), head)
  if (failure) throw new IntakeFailure(failure)
}

export function pickerRecord(file: File, editor: EditorSlug, id: string, now = Date.now()): IntakeRecord {
  return {
    id, name: file.name, file, editor, batchId: undefined, sourceMode: 'PICKER', claimedMime: file.type, size: file.size,
    state: 'READY', errorCode: null, reason: null, recoverable: false, createdAt: now, expiresAt: now + INTAKE_LIMITS.ttlMs,
  }
}

export async function prepareFile(file: File): Promise<string> {
  const editor = validateFile(file)
  await checkSignature(file)
  const id = crypto.randomUUID()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(FILE_DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(FILE_STORE, { keyPath: 'id' })
    request.onerror = () => reject(new IntakeFailure('noSpace'))
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(FILE_STORE, 'readwrite')
      const store = transaction.objectStore(FILE_STORE)
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (entry) {
          if (entry.value.expiresAt < Date.now()) entry.delete()
          entry.continue()
        }
      }
      store.put(pickerRecord(file, editor, id))
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onabort = () => { db.close(); reject(new IntakeFailure('quota')) }
    }
  })
  return `${editorPath(editor)}?open=${encodeURIComponent(id)}`
}
