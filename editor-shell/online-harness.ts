// Runs the online-*.js shell scripts in node against fakes: DOM, IndexedDB, erpAccount + Office API, a manual
// clock for retries and a fork that registers with window.erpHost like the editors' web builds will.
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { ONLINE_SCRIPTS } from '../src/lib/editor-shell/assets.ts'
import { ManualClock } from './fake-browser.ts'
import { FakeDocument, FakeElement, FakeEvent } from './fake-dom.ts'
import { FakeIdb } from './fake-idb.ts'
import { DOC_ID, FakeOffice, fakeAccount, type FakeAccountState } from './fake-office.ts'

const source = (name: string) => fs.readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

/** Fake IndexedDB answers over a few real macrotasks (see drafts.test.ts). */
export async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 20))
  for (let hop = 0; hop < 20; hop++) await new Promise(resolve => setTimeout(resolve, 0))
}

export interface HostDoc { docId: string; version: number; title: string; format: string; bytes: Uint8Array }
export interface SaveResult { status: string; version?: number; latestVersion?: number | null; retryable?: boolean; message?: string }
export interface ErpHost {
  version: number
  ready(handlers: { open(doc: HostDoc): void; flush?(): Promise<void>; acknowledged?(docId: string, revision: number, version: number): void }): void
  save(docId: string, bytes: Uint8Array, options: { revision: number; reason: string }): Promise<SaveResult>
  dirty(docId: string, dirty: boolean): void
  opened(docId: string, ok: boolean, reason?: string): void
  closed(docId: string): void
}

export interface PageOptions {
  pathname?: string
  search?: string
  office?: FakeOffice
  idb?: FakeIdb
  account?: FakeAccountState
  /** Scripts to run; the online set by default. */
  scripts?: string[]
  random?: number
}

export function onlinePage(options: PageOptions = {}) {
  const office = options.office ?? new FakeOffice().add(DOC_ID, 'Báo cáo quý', 'docx', new Uint8Array([1, 2, 3]))
  const idb = options.idb ?? new FakeIdb()
  const account = fakeAccount(office, options.account ?? { status: 'signed-in', sub: 'usr_an' })
  const clock = new ManualClock(Date.now())
  const document = new FakeDocument()
  const bar = document.createElement('header')
  bar.className = 'erp-shell'
  const nav = document.createElement('nav')
  nav.className = 'erp-shell__nav'
  bar.appendChild(nav)
  document.body.appendChild(bar)
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  const pathname = options.pathname ?? '/van-ban/'
  const location = { pathname, search: options.search ?? `?doc=${DOC_ID}`, origin: 'https://office.erpcons.ai', reloads: 0, reload() { location.reloads += 1 } }
  const history = {
    state: null,
    urls: [] as string[],
    replaceState(_state: unknown, _title: string, url: string) {
      history.urls.push(url)
      location.search = url.slice(url.indexOf('?'))
    },
  }
  const listeners: Record<string, ((event: FakeEvent) => void)[]> = {}
  const notices: { text: string; role: string }[] = []
  const logs: unknown[][] = []
  const context: Record<string, unknown> = {
    erpAccount: account,
    erpIntake: { message: (code: string) => `[${code}]` },
    erpShellNotice: (text: string, role: string) => notices.push({ text, role }),
    indexedDB: idb,
    document, location, history,
    URLSearchParams, Uint8Array, ArrayBuffer, FormData, Blob, Response,
    crypto: globalThis.crypto,
    Math: Object.assign(Object.create(Math), { random: () => options.random ?? 0.5 }),
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    console: { warn: (...args: unknown[]) => logs.push(args), error: (...args: unknown[]) => logs.push(args), log: (...args: unknown[]) => logs.push(args) },
    addEventListener: (type: string, fn: (event: FakeEvent) => void) => { (listeners[type] ||= []).push(fn) },
  }
  context.window = context
  vm.createContext(context)
  for (const name of options.scripts ?? ONLINE_SCRIPTS) vm.runInContext(source(name), context)

  const opened: HostDoc[] = []
  const acks: { docId: string; revision: number; version: number }[] = []
  let flushes = 0
  const page = {
    office, idb, account, clock, document, bar, canvas, location, history, notices, logs, opened, acks,
    window: context,
    get host() { return context.erpHost as ErpHost | undefined },
    get online() { return context.erpOnline as { flush(): Promise<void> } },
    get flushes() { return flushes },
    /** Window events: beforeunload, online, pagehide. */
    fire(type: string, event = new FakeEvent(type)) {
      (listeners[type] || []).forEach(fn => fn(event))
      return event
    },
    dialog(): FakeElement | null { return document.querySelector('[data-erp-online-dialog]') },
    dialogId() { return page.dialog()?.getAttribute('data-erp-online-dialog') ?? null },
    badge(): FakeElement | null { return document.querySelector('[data-erp-save-state]') },
    /** Lets fake IndexedDB answer and the badge render. */
    async settle() {
      for (let i = 0; i < 3; i++) {
        await flush()
        clock.advance(0)
      }
    },
    /**
     * The fork registers its handlers, as each `apps/<fork>-web` will. `acknowledged` runs after the call is
     * recorded in `acks`; null registers none, like a fork built before it.
     */
    fork(onFlush: () => Promise<void> = async () => {}, acknowledged: ((docId: string, revision: number, version: number) => void) | null = () => {}) {
      page.host!.ready({
        open: doc => { opened.push(doc) },
        flush: () => { flushes += 1; return onFlush() },
        ...(acknowledged ? { acknowledged: (docId: string, revision: number, version: number) => { acks.push({ docId, revision, version }); acknowledged(docId, revision, version) } } : {}),
      })
    },
  }
  return page
}
