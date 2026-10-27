import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { EDITORS } from '../src/config/editors.ts'
import {
  ACCEPTED_EXTENSIONS, INTAKE_STATES, SIGNATURE_RULES, UNCHECKED_FORMATS, displayName, intakeContract, intakeContractScript,
  intakeMessage, matchesSignature, signatureFailure, type IntakeReason,
} from '../src/lib/files/intake-contract.ts'
import { FakeIdb } from './fake-idb.ts'

const script = fs.readFileSync(fileURLToPath(new URL('intake.js', import.meta.url)), 'utf8')

interface Intake {
  contract: ReturnType<typeof intakeContract>
  editorFor(name: string): string | undefined
  displayName(name: string): string
  message(reason: string): string
  code(reason: string): string
  matchesSignature(ext: string, head: Uint8Array): boolean
  validate(file: unknown): Promise<string | null>
  record(fields: Record<string, unknown>): Record<string, unknown>
  fail(item: Record<string, unknown>, reason: string, retryable?: boolean): Record<string, unknown>
  isExpired(item: unknown, now?: number): boolean
  deliverable(item: Record<string, unknown>, now?: number): boolean
  openDb(): Promise<IDBDatabase>
  pruneExpired(store: unknown, now: number): void
  update(db: unknown, id: string, change: (item: Record<string, unknown>) => unknown): Promise<Record<string, unknown> | null>
}

function load(idb = new FakeIdb(), globalName: 'window' | 'self' = 'window') {
  const context: Record<string, unknown> = { indexedDB: idb, Date, Promise, Uint8Array }
  context[globalName] = context
  vm.createContext(context)
  vm.runInContext(intakeContractScript(globalName), context)
  vm.runInContext(script, context)
  return context.erpIntake as Intake
}

const bytes = (text: string) => new Uint8Array(Buffer.from(text))
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0])
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])
const RTF = bytes('{\\rtf1\\ansi x}')
const PDF = bytes('%PDF-1.7\n')
const HTML = bytes('<html><body>x</body></html>')
const EXE = bytes('MZ\x90\x00')

describe('intake message table', () => {
  const intake = load()
  const reasons = Object.keys(intake.contract.messages) as IntakeReason[]

  it('ends every sentence with its short code, and the shell scripts read the same text as the landing', () => {
    expect(reasons.length).toBeGreaterThan(15)
    for (const reason of reasons) {
      const text = intakeMessage(reason)
      expect(text, reason).toMatch(/^[^()]+\(Mã: [A-Z_]+\)$/)
      expect(intake.message(reason)).toBe(text)
      expect(text.endsWith(`(Mã: ${intake.code(reason)})`)).toBe(true)
    }
  })

  it('only uses the spec V3 §03 error codes Office can actually meet', () => {
    const codes = new Set(reasons.map((reason) => intake.code(reason)))
    expect([...codes].sort()).toEqual([
      'ACCESS_DENIED', 'INVALID_SIGNATURE', 'NO_SPACE', 'OFFLINE_DEPENDENCY', 'PARSER_FAILED', 'PERMISSION_EXPIRED',
      'QUOTA_EXCEEDED', 'SOURCE_UNAVAILABLE', 'TOO_LARGE', 'UNSUPPORTED_TYPE', 'USER_CANCELLED',
    ])
  })

  it('falls back to a generic storage message for an unknown reason', () => {
    expect(intake.message('nope')).toBe(intakeMessage('storageError'))
  })

  it('works in the service worker global too', () => {
    expect(load(new FakeIdb(), 'self').message('tooLarge')).toBe(intakeMessage('tooLarge'))
  })

  it('keeps the states of §03 that Office can reach, in order', () => {
    expect(intake.contract.states).toEqual(INTAKE_STATES)
    expect(INTAKE_STATES).toEqual(['RECEIVED', 'VALIDATING', 'READY', 'ROUTED', 'DELIVERED', 'OPENED', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED', 'EXPIRED'])
  })
})

describe('routing', () => {
  const intake = load()

  it('sends every accepted extension, in any case, to the editor that declares it', () => {
    for (const editor of EDITORS) {
      for (const ext of editor.accepts) {
        expect(intake.editorFor(`Báo cáo.${ext.toUpperCase()}`), ext).toBe(editor.slug)
        expect(intake.editorFor(`a.b.${ext}`), ext).toBe(editor.slug)
      }
    }
  })

  it.each(['anh.jpg', 'slides.ppt', 'deck.odp', 'page.html', 'file.pdf.exe', 'no-extension', 'x.constructor', 'x.__proto__', ''])('refuses %s', (name) => {
    expect(intake.editorFor(name)).toBeUndefined()
  })
})

describe('signature sniffing', () => {
  const intake = load()

  it('has a rule, or a deliberate "plain text" exemption, for every accepted format', () => {
    for (const ext of ACCEPTED_EXTENSIONS) expect(Boolean(SIGNATURE_RULES[ext]) !== UNCHECKED_FORMATS.includes(ext), ext).toBe(true)
  })

  const cases: [string, Uint8Array, boolean][] = [
    ['docx', ZIP, true], ['docx', OLE, true], ['docx', PDF, false], ['docx', HTML, false],
    ['doc', OLE, true], ['doc', RTF, true], ['doc', ZIP, true], ['doc', HTML, false], ['dot', OLE, true],
    ['rtf', RTF, true], ['rtf', EXE, false], ['odt', ZIP, true], ['odt', OLE, false],
    ['xlsx', ZIP, true], ['xlsx', OLE, true], ['xls', OLE, true], ['xls', HTML, false], ['xlsb', ZIP, true], ['ods', ZIP, true], ['ods', RTF, false],
    ['pptx', ZIP, true], ['pptx', OLE, false], ['ppsx', ZIP, true], ['potx', PDF, false], ['pptm', ZIP, true],
    ['pdf', PDF, true], ['pdf', ZIP, false], ['pdf', new Uint8Array([...new Array(1019).fill(32), ...PDF]), true],
    ['pdf', new Uint8Array([...new Array(1020).fill(32), ...PDF]), false],
    ['txt', EXE, true], ['md', HTML, true], ['csv', PDF, true], ['tsv', new Uint8Array(), true],
    ['jpg', ZIP, false], ['docx', new Uint8Array([0x50, 0x4b]), false],
  ]
  it.each(cases)('.%s with %j → %s, the same in the landing and in the shell', (ext, head, ok) => {
    expect(matchesSignature(ext, head)).toBe(ok)
    expect(intake.matchesSignature(ext, head)).toBe(ok)
  })
})

describe('signature failures', () => {
  const intake = load()
  it('names an OLE PowerPoint file (password-protected PPTX or a renamed PPT) apart from a plain mismatch', () => {
    for (const ext of ['pptx', 'pptm', 'potx', 'ppsx']) expect(signatureFailure(ext, OLE), ext).toBe('encryptedPresentation')
    expect(signatureFailure('pptx', PDF)).toBe('signature')
    expect(signatureFailure('odt', OLE)).toBe('signature')
    expect(signatureFailure('docx', OLE)).toBeNull()
    expect(intakeMessage('encryptedPresentation')).toMatch(/mật khẩu.*\(Mã: UNSUPPORTED_TYPE\)$/)
    expect(intake.contract.oleRefused).toEqual(['pptx', 'pptm', 'potx', 'ppsx'])
  })
})

describe('validate', () => {
  const intake = load()
  const file = (name: string, content: Uint8Array, size = content.length) => {
    const f = new File([new Uint8Array(content)], name)
    Object.defineProperty(f, 'size', { value: size })
    return f
  }

  it('gives the reason a file is refused, cheapest checks first', async () => {
    expect(await intake.validate(file('a.docx', ZIP))).toBeNull()
    expect(await intake.validate(file('a.jpg', ZIP))).toBe('unsupported')
    expect(await intake.validate(file('a.docx', new Uint8Array()))).toBe('empty')
    expect(await intake.validate(file('a.docx', ZIP, 100 * 1024 * 1024 + 1))).toBe('tooLarge')
    expect(await intake.validate(file('a.docx', PDF))).toBe('signature')
    expect(await intake.validate(file('a.pptx', OLE))).toBe('encryptedPresentation')
    expect(await intake.validate(file('a.pptx', PDF))).toBe('signature')
    expect(await intake.validate(null)).toBe('unsupported')
  })

  it('reports a file the source app no longer lets it read', async () => {
    const gone = { name: 'a.pdf', size: 10, slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotReadableError')) }) }
    expect(await intake.validate(gone)).toBe('unreadableShare')
  })
})

describe('display names', () => {
  const intake = load()

  it('strips bidi controls that would disguise an extension, in the landing and the shell alike', () => {
    for (const name of ['\u202efdp.exe', 'a\u202ab\u202bc\u202cd\u202d.docx', 'x\u2066y\u2067z\u2068w\u2069.pdf']) {
      expect(displayName(name)).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/)
      expect(intake.displayName(name)).toBe(displayName(name))
    }
    expect(intake.displayName('\u202efdp.exe')).toBe('fdp.exe')
    expect(intake.displayName('Báo cáo quý 3 (1).docx')).toBe('Báo cáo quý 3 (1).docx')
  })
})

describe('records and states', () => {
  const intake = load()

  it('fills every contract field', () => {
    const before = Date.now()
    const record = intake.record({ id: 'a', name: 'a.pdf', editor: 'pdf', sourceMode: 'SHARE_IN' })
    expect(record).toMatchObject({ id: 'a', batchId: null, sourceMode: 'SHARE_IN', name: 'a.pdf', claimedMime: '', size: 0, editor: 'pdf', state: 'RECEIVED', errorCode: null, reason: null, recoverable: false })
    expect(record.createdAt).toBeGreaterThanOrEqual(before)
    expect(record.expiresAt).toBe((record.createdAt as number) + 60 * 60 * 1000)
  })

  it('drops the bytes of a final failure and keeps them for a retry', () => {
    const final = intake.fail({ id: 'a', file: 'bytes' }, 'signature')
    expect(final).toEqual({ id: 'a', state: 'FAILED_FINAL', reason: 'signature', errorCode: 'INVALID_SIGNATURE', recoverable: false })
    const retry = intake.fail({ id: 'b', file: 'bytes' }, 'notReady', true)
    expect(retry).toEqual({ id: 'b', file: 'bytes', state: 'FAILED_RETRYABLE', reason: 'notReady', errorCode: 'OFFLINE_DEPENDENCY', recoverable: true })
  })

  it('delivers READY, ROUTED, FAILED_RETRYABLE and pre-contract records, nothing already handed over', () => {
    const states = Object.fromEntries(['READY', 'ROUTED', 'FAILED_RETRYABLE', 'DELIVERED', 'OPENED', 'FAILED_FINAL', 'CANCELLED', 'EXPIRED'].map((state) => [state, intake.deliverable({ state })]))
    expect(states).toEqual({ READY: true, ROUTED: true, FAILED_RETRYABLE: true, DELIVERED: false, OPENED: false, FAILED_FINAL: false, CANCELLED: false, EXPIRED: false })
    expect(intake.deliverable({ id: 'old', name: 'a.docx' })).toBe(true)
  })

  it('holds a record another tab claimed, until that claim is older than the handoff could take', () => {
    const now = 1_000_000
    expect(intake.deliverable({ state: 'READY', claimedAt: now - 1000 }, now)).toBe(false)
    expect(intake.deliverable({ state: 'READY', claimedAt: now - 150_001 }, now)).toBe(true)
  })

  it('treats a missing record as expired', () => {
    expect(intake.isExpired(undefined)).toBe(true)
    expect(intake.isExpired({ expiresAt: 5 }, 6)).toBe(true)
    expect(intake.isExpired({ expiresAt: 7 }, 6)).toBe(false)
  })
})

describe('the IndexedDB queue', () => {
  async function seeded(rows: Record<string, unknown>[]) {
    const idb = new FakeIdb()
    const intake = load(idb)
    const db = await intake.openDb()
    for (const row of rows) idb.seed('pending', row)
    return { idb, intake, db }
  }

  it('prunes only expired entries', async () => {
    const { idb, intake, db } = await seeded([{ id: 'old', expiresAt: 1 }, { id: 'new', expiresAt: Date.now() + 1000 }])
    await new Promise<void>((resolve) => {
      const transaction = db.transaction('pending', 'readwrite')
      intake.pruneExpired(transaction.objectStore('pending'), Date.now())
      transaction.oncomplete = () => resolve()
    })
    expect(idb.rows('pending').map((row) => row.id)).toEqual(['new'])
  })

  it('updates one record in place, or leaves it when the change declines', async () => {
    const { idb, intake, db } = await seeded([{ id: 'a', state: 'DELIVERED', expiresAt: Date.now() + 1000 }])
    expect(await intake.update(db, 'a', (item) => { if (item.state !== 'READY') return false; item.state = 'ROUTED' })).toBeNull()
    expect(idb.rows('pending')[0].state).toBe('DELIVERED')
    expect(await intake.update(db, 'a', (item) => { item.state = 'OPENED' })).toMatchObject({ id: 'a', state: 'OPENED' })
    expect(idb.rows('pending')[0].state).toBe('OPENED')
    expect(await intake.update(db, 'missing', () => {})).toBeNull()
  })

  it('names why the queue cannot be opened', async () => {
    const intake = load(Object.assign(new FakeIdb(), { failOpen: true }))
    await expect(intake.openDb()).rejects.toMatchObject({ reason: 'storageError' })
    const denied = load({ open: () => { throw new DOMException('denied', 'SecurityError') } } as unknown as FakeIdb)
    await expect(denied.openDb()).rejects.toMatchObject({ reason: 'storageDenied' })
  })
})
