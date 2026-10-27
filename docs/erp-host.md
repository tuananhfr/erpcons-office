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
- Keeps the last unacknowledged bytes of each host document in its own IndexedDB pending store (keyed by `docId`,
  with the base version and its ETag) until `saved`, so a crash or a lost connection never loses them (spec §07 "local checkpoint",
  T07). On the next open of that document it offers them back ("Có bản chưa lưu lên máy chủ"): saving them uses the
  stored base version, so a newer server version still surfaces as a conflict.
- Shows the save state from spec §07 next to the title: `LOCAL_ONLY` "Chưa lưu lên máy chủ", `SAVING` "Đang lưu…",
  `SERVER_DURABLE` "Đã lưu", `ERROR` with the message.
- Asks before unload while any document is dirty or a save is in flight (T06).

## Not in v1

Read-only and comment-only modes (phase 2, ACL), presence and co-editing, saving a local file into the online store
from inside the editor, format conversion on upload, the desktop apps.

## Tests each fork adds

Unit/headless tests in the fork for rules 1–6 and 10–11 with a fake `erpHost` (revision passed and acknowledged,
`acknowledged` after `offline`, an older `acknowledged` ignored, coalescing, no retry on conflict, dirty after an
in-flight edit, `opened` reason keys, flush resolving without waiting for answers). The shell has vitest coverage for the HTTP mapping; the integration
E2E (Playwright, `pi-mock` + server + site) covers save, reload, two-tab conflict, offline and unload.
