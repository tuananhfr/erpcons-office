# `window.erpHost` v1: online documents between the shell and an editor

Status: draft for review (M0, 2026-10-27). Applies to the web builds of the four forks (`apps/<fork>-web`, behind
`cfg(target_arch = "wasm32")`); the desktop apps are unchanged. Decision: `docs/adr/online-tier.md`.

Today the shell hands files in through a synthetic drop (`erpShellDeliver`) and catches saves by replacing
`showSaveFilePicker`; editors treat handing the bytes over as saved and never learn which document was saved. `erpHost`
replaces both paths for documents that live on the server. Local files, the picker, share-in and the ERP embed keep
their current paths.

## Activation

`editor-shell/online.js` defines `window.erpHost` before the editor's wasm starts, only when `ONLINE_ENABLED`, the user
is signed in and the page URL carries `?doc=<document_id>`. The fork checks once at start-up:

```js
window.erpHost && window.erpHost.version === 1
```

Absent or another version: the fork behaves as today. `erpHost` and the ERP embed bridge are never active together.

## Shell → editor

The fork registers its handlers once, after it can accept a document:

```js
erpHost.ready({
  open(doc) {},   // doc: { docId, version, title, format, bytes: Uint8Array }
  flush() {},     // returns a Promise that settles when every document with edits has had a save attempt
  acknowledged(docId, revision, version) {},  // the shell stored that revision on its own retry
})
```

- `open` may be called more than once (several documents in tabs, or a reload of the latest version after a
  conflict). `title` is the display name, never a path. `format` is the extension the server stored: `docx`, `xlsx`,
  `pptx` or `pdf` in v1.
- The fork reports the outcome of every `open` with `erpHost.opened(docId, ok, reason?)`: same rules as
  `erpIntakeResult` (`ok` false for a parse failure, a refused format or the document limit; a password prompt is
  `ok` true). `reason` is a key of the shell's intake messages, never display text: `unsupported` for a format the
  editor does not take (wrong extension, a password-protected or legacy file), `parserFailed` for unreadable bytes or
  the document limit. The shell shows the matching sentence.
- `flush` is called before the page hides or navigates (`pagehide`, the shell's close button, sign-out). The fork hands
  every document whose revision differs from its last acknowledged one to `erpHost.save` (reason `flush`), behind any
  save in flight, and resolves once each has been handed over; it does not wait for the shell's answers, which the
  shell tracks itself. Documents stopped by a conflict, a non-retryable failure or a pending user confirmation (data
  loss warning, signed document) are skipped. It must resolve within 10 s.
- `acknowledged(docId, revision, version)` is called when the shell's own retry of an `offline` or retryable `failed`
  save succeeded. `revision` is the one the fork passed to that `save`. The fork treats it exactly like a `saved`
  answer for that revision (rule 1) and ignores it when it is older than the revision it last saw acknowledged. Only
  sent within the page session that made the save; bytes recovered from the pending store after a reload are not
  acknowledged.

## Editor → shell

| Call | When | Returns |
|---|---|---|
| `erpHost.save(docId, bytes, { revision, reason })` | AutoSave, Ctrl+S / "Lưu", or `flush`. `reason` is `auto`, `manual` or `flush` | `Promise<SaveResult>` |
| `erpHost.dirty(docId, dirty)` | Whenever the document's revision first differs from the acknowledged one, and when it matches again | — |
| `erpHost.opened(docId, ok, reason?)` | Once per `open` | — |
| `erpHost.closed(docId)` | The user closed that document's tab | — |

`bytes` is the document saved in the format it was opened in (`format`), with the editor's own export path (the same
bytes "Lưu" writes today). Save As, Export and Print keep downloading locally in v1.

```ts
type SaveResult =
  | { status: 'saved', version: number }                  // durable on the server
  | { status: 'conflict', latestVersion: number }          // someone saved since our base version; nothing was written
  | { status: 'offline' }                                  // not sent; the shell keeps the bytes and retries
  | { status: 'failed', retryable: boolean, message: string }  // `message` is Vietnamese, ready to show
```

### Rules for the fork

1. **Clean only on `saved`.** The fork marks the document saved *as of the `revision` it passed*, never as of "now":
   edits typed while the request was in flight stay dirty and trigger the next AutoSave.
2. **One save in flight per document.** While one is pending, later triggers coalesce into a single follow-up save of
   the newest revision.
3. **AutoSave timing:** 3 s after the last edit, and at most every 30 s while edits keep coming. Ctrl+S saves at once
   (still serialised behind an in-flight save).
4. **Conflict:** stop AutoSave for that document and leave it dirty; the shell shows the conflict dialog and either
   calls `open` with the latest version or saves the fork's bytes as a new document ("Lưu bản của tôi thành bản sao").
   The fork never retries a `conflict` by itself.
5. **`offline` and `failed` with `retryable`:** keep the document dirty, keep AutoSave running. The shell owns retry
   and backoff and shows the state; the fork shows nothing extra.
6. **`failed` without `retryable`:** stop AutoSave for that document and show `message` in the fork's usual save-error
   surface.
7. Logs follow the existing rule: no document title, id or bytes in any log line.
8. **No `erpDrafts` for host documents.** A document opened through `erpHost` is never put in `erpDrafts`; its recovery
   is the shell's pending store below, so a reload cannot offer an old local draft over a newer server version.
   Documents opened from the device in the same page keep using `erpDrafts` as today.
9. **Ctrl+S / "Lưu" on a host document calls `erpHost.save`** (reason `manual`), never the file picker. Save As,
   Export and Print stay local downloads. A manual save after a conflict or a non-retryable failure is still sent (the
   user asked for it); a `saved` answer restarts AutoSave.
10. **The fork's own `beforeunload` guard counts local documents only.** The shell guards host documents; counting
    them twice would still prompt right after a successful flush.
11. **Host documents never enter "Reopen closed document".** Reopening one would turn it into a local copy that the
    user could mistake for the server document.

## Shell responsibilities (`editor-shell/online.js`)

- Fetches `GET /api/v1/documents/{id}` and `/content`, then calls `open`. Any 404 shows "Không tìm thấy tài liệu
  hoặc bạn không có quyền mở" without saying which.
- Maps `save` to `PUT /api/v1/documents/{id}/content` with `If-Match: <etag of the base version>`: 200 → `saved`,
  409 `VERSION_CONFLICT` → `conflict`, network error → `offline`, 413/422 → `failed` (`retryable: false`), 429/503 →
  `failed` (`retryable: true`) after its own retries.
- Calls the API only through `erpAccount.apiFetch(path, init)`, which attaches the access token, refreshes it once on
  401, and refuses any URL that is not a same-origin `/api/v1/` path, so the token can never be sent elsewhere.
- Remembers the `revision` of the bytes it retries and calls the editor's `acknowledged` when that retry is stored.
- Keeps the last unacknowledged bytes of each host document in its own IndexedDB pending store (keyed by the account
  and the document, `[sub, docId]`, with the base version, its ETag and the last known role and `canDownload`) until
  `saved`, so a crash or a lost connection never loses them (spec §07 "local checkpoint", T07). On the next open of that
  document by the same account it offers them back ("Có bản chưa lưu lên máy chủ"): saving them uses the stored base
  version, so a newer server version still surfaces as a conflict. Offline, they reopen with the stored role (read-only
  when none was stored). A document the account can no longer open still offers them as a copy ("Lưu bản của tôi thành
  bản sao", or "Bỏ bản của tôi"). Records expire after 30 days; an explicit sign-out with records left asks whether to
  delete them.
- Shows the save state from spec §07 next to the title: `LOCAL_ONLY` "Chưa lưu lên máy chủ", `SAVING` "Đang lưu…",
  `SERVER_DURABLE` "Đã lưu", `ERROR` with the message.
- Asks before unload while any document is dirty or a save is in flight (T06).

## Not in v1

Read-only and comment-only modes (phase 2, ACL), presence and co-editing, saving a local file into the online store
from inside the editor, format conversion on upload, the desktop apps.

## v2 (phase 2): access modes

Status: approved plan `tmp/briefs/office-online-v2/plan.md` (2026-10-29). Co-editing and comment calls are added to this
section in later milestones; until then v2 is v1 plus the calls below.

The shell sets `erpHost.version = 2`. A v2 fork accepts `1` or `2`; with `1` everything below is absent and the
document is editable as in v1.

### Shell → editor

```js
erpHost.ready({
  open(doc) {},          // doc adds: mode, canDownload, preserveView (below)
  flush() {},
  acknowledged(docId, revision, version) {},
  setMode(docId, mode, canDownload) {},   // v2: access changed while the document is open
  setUser(user) {},      // v2: { id, name } of the signed-in PI account, or null for an anonymous link viewer
})
```

- `doc.mode`: `'edit' | 'comment' | 'view'`, absent = `'edit'`. In phase 2 `'comment'` behaves like `'view'` for the
  document content; server comments arrive in a later milestone. In-file comments (DOCX/XLSX/PPTX comments, PDF
  annotations) are content and are read-only in both.
- `doc.canDownload`: absent = `true`. `false` disables Save As, Export, Print and copying document content to the
  clipboard (as Google Docs does for viewers and commenters when the owner turns it off).
- `doc.preserveView`: `true` when `open` reloads a newer version of a document already open (a viewer catching up).
  The fork replaces the content in the same tab and keeps what the user was looking at as far as it still exists:
  Văn bản the first visible block and the selection, Bảng tính the active sheet, the selection and the top-left cell,
  Trình chiếu the current slide and the selection, PDF the page and the zoom.
- `setMode` applies the same rules as `doc.mode` / `doc.canDownload` to an open document without reloading it.
  The fork never discards edits on its own: a downgrade first commits any edit still held in an inline editor (notes,
  cell editor, text box, comment field) as one undo step, then switches. Downgrade sequence in the shell: `flush()`,
  `setMode(…)`, then `flush()` again when the fork reports the document dirty, so text that was still being typed
  reaches the server or, if access is gone, the pending store and "Lưu bản của tôi thành bản sao".
- `setUser` names the author the fork writes into anything it creates for this user (comments, revision marks) instead
  of the local preference name. Called before the first `open` and on account changes.

### Rules in `view` and `comment` mode

12. **Nothing can change the document.** Every mutating path is refused at the engine's single edit entry point, and
    the UI does not offer it: typing and IME, ribbon and menu commands, paste, drag and drop (including files),
    context-menu edits, find-and-replace, undo/redo, form fields and annotations, inline editors (cells, text boxes).
    Navigation, selection, zoom, find, view switches and (when `canDownload`) copy, Save As, Export and Print still work.
13. **No save traffic.** AutoSave never runs and Ctrl+S does nothing beyond the fork's usual "read-only" notice. A
    document opened in `view`/`comment` never becomes dirty and `flush` resolves at once for it. One exception: a
    document downgraded while dirty keeps those edits, stays dirty, and `flush` hands it to `save` (reason `flush`)
    under rules 1–6 until it is `saved` or stopped by a conflict or a non-retryable failure; nothing new can make it
    dirty.
14. **A visible state.** The fork shows its read-only look (disabled editing commands; Văn bản may use Read Mode); the
    shell adds the badge "Chỉ xem" next to the title. Until web comments (M5), `comment` reads as view only: the
    badge also says "Chỉ xem", and the shell's and the fork's notice say "Nhận xét trên web sẽ có sau, hiện chỉ xem
    được". The shell's "Chia sẻ" button is for owners and editors only, and only while the document's `can_share`
    is not false (an editor loses it when the owner turns "editors can share" off).
15. **Logs** as rule 7.

### Shell responsibilities added in v2

- Reads the caller's `role` from `GET /api/v1/documents/{id}` (or `GET /api/v1/link`) and maps it: owner, editor →
  `edit`; commenter → `comment`; viewer, link → `view`. `canDownload` and `can_share` come from the same response,
  and every refresh applies them again.
- A 403/404 answer to a save means access was removed: the shell keeps the bytes in its pending store, calls
  `setMode(docId, 'view', …)`, and offers "Lưu bản của tôi thành bản sao" into the user's own root folder.
- Every downgrade (role change seen on refresh, or the 403/404 above) follows the sequence in `setMode`: `flush()`,
  `setMode`, and a second `flush()` when the document is still dirty; a 403/404 on that save ends in the same offer.
- Phase 2 has no live channel, so while the page is visible the shell re-reads the document every 30 s: a changed role
  or `canDownload` becomes `setMode` (after `flush()` when it is a downgrade and edits are in hand), a newer version
  reaches a reader as `open` with `preserveView`, and a removed permission ends in a "not found" notice.
- `/<editor>/?doc=<id>&version=<seq>` opens that version in `view` mode (the history's "Xem"); nothing is saved.
- `/<editor>/#link=<token>` (public view link): no sign-in, `setUser(null)` whoever is signed in, `mode: 'view'`, every
  save answers `failed`; "Tải về" in the shell bar when `canDownload`. The token is only ever in the fragment, which
  reaches no server log or Referer: the shell removes any `#link=` fragment with `history.replaceState` first, on every
  page and before any request, keeps the token in memory only (no storage, no logs) and sends it as `X-Link-Token` to
  `GET /api/v1/link` and `/api/v1/link/content`. The history entry of the original navigation still holds it, so a
  link ends only by expiry or reset. Signing in on that page continues on `/<editor>/?doc=<id>` when the account has
  its own access to the document, and stays on the link view otherwise. The editor pages carry
  `<meta name="referrer" content="no-referrer">` when online documents are on.
- `&version=<seq>`: the shell tracks that version with no ETag and refuses every save on the page.

### Tests each fork adds (v2)

Headless tests that every edit entry point is refused in `view` and in `comment` (one test per command family plus key
input, paste and drop), that `setMode` both ways keeps the document and its undo history intact, that `canDownload:
false` disables Save As / Export / Print / copy, that `preserveView` keeps the listed view state, and that `setUser`
becomes the author of a new in-file comment in `edit` mode.

## Tests each fork adds

Unit/headless tests in the fork for rules 1–6 and 10–11 with a fake `erpHost` (revision passed and acknowledged,
`acknowledged` after `offline`, an older `acknowledged` ignored, coalescing, no retry on conflict, dirty after an
in-flight edit, `opened` reason keys, flush resolving without waiting for answers). The shell has vitest coverage for the HTTP mapping; the integration
E2E (Playwright, `pi-mock` + server + site) covers save, reload, two-tab conflict, offline and unload.
