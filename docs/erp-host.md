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

Absent or another version: the fork behaves as today. `online.js` never defines `erpHost` on an embedded page; there,
with `&v=2`, `host-bridge.js` offers its own `erpHost` v2 that forwards to the ERP page (`docs/erp-embed.md`, protocol v2).

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
  setClientId(prefix) {}, // v2, optional (M3): this page's id prefix for ids the editor creates
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
- `setClientId(prefix)` (optional; the shell feature-detects it like every handler past `open`): `prefix` is 6
  lowercase hex characters (24 random bits), drawn once per page load. The shell calls it right after `ready`, before
  the first `open`, and again (same value) after every `hello` of the live room, also on the public link page. The fork
  mixes it into every id it newly creates (Văn bản `w14:paraId`, list and comment ids; Trình chiếu slide and shape ids;
  PDF `/NM`) so that two people adding things to the same document at once never produce the same id. Ids already in
  the file never change on save or reopen. A fork that never receives it picks its own random prefix: an id never
  rests on a local counter alone.

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
    shell adds the badge "Chỉ xem" (`view`) or "Chỉ nhận xét" (`comment`, since M5: the content stays read-only and
    the shell's comments panel takes comments, see "v3 (M5): anchored comments") next to the title. The shell's "Chia sẻ" button is for owners and editors only, and only while the document's `can_share`
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
- While the page is visible the shell re-reads the document every 30 s: a changed role or `canDownload` becomes
  `setMode` (after `flush()` when it is a downgrade and edits are in hand), a newer version reaches a reader as `open`
  with `preserveView`, and a removed permission ends in a "not found" notice.
- Live room (M3, `online-live.js`; server contract in erpcons-office-server `docs/openapi.yaml`, "Live channel"): once
  the document is open the shell trades the PI token (on the link page the link token in `X-Link-Token`) for a one-time
  ticket and opens `wss://<origin>/api/v1/documents/<id>/live?ticket=…`; every reconnect (backoff as for saves, at
  least 30 s after a full room) takes a fresh ticket. The bar shows the other members (`online-presence.js`). The room's
  `mode` acts at once: a downgrade follows the `setMode` sequence above, an upgrade (a freed editor slot, a role
  raised) is applied and the role read again. The room only ever narrows the role's mode: past its editor limit an
  editor stays in `view` with the notice "Đã đủ 10 người sửa, bạn đang ở chế độ xem" until a slot frees. `bye`
  `revoked` (close 4003) takes the same path as a check that found the document gone. Leaving the page sends `bye`.
  The 30 s check stays as the fallback (`canDownload`, `can_share`, a page whose channel cannot open).
- `/<editor>/?doc=<id>&version=<seq>` opens that version in `view` mode (the history's "Xem"); nothing is saved.
- `/<editor>/#link=<token>` (public view link): no sign-in, `setUser(null)` whoever is signed in, `mode: 'view'`, every
  save answers `failed`; "Tải về" in the shell bar when `canDownload`. The token is only ever in the fragment, which
  reaches no request, server log or Referer. Since 2026-11-02 the link page keeps it in the address bar, as Google Docs
  does, so a reload opens the link again and the URL can be copied from there: the browser history kept it anyway (the
  original navigation), and the link only lets people view, and the owner can reset it at any time. Any other page with
  a `#link=` fragment (with `?doc=`, embedded, extra parameters, no account script) still drops it with
  `history.replaceState` before any request. The shell never stores or logs the token and sends it only as
  `X-Link-Token` to `GET /api/v1/link` and `/api/v1/link/content`. Signing in on that page continues on `/<editor>/?doc=<id>` when the account has
  its own access to the document, and stays on the link view otherwise. The editor pages carry
  `<meta name="referrer" content="no-referrer">` when online documents are on.
- `&version=<seq>`: the shell tracks that version with no ETag and refuses every save on the page.

### Tests each fork adds (v2)

Headless tests that every edit entry point is refused in `view` and in `comment` (one test per command family plus key
input, paste and drop), that `setMode` both ways keeps the document and its undo history intact, that `canDownload:
false` disables Save As / Export / Print / copy, that `preserveView` keeps the listed view state, and that `setUser`
becomes the author of a new in-file comment in `edit` mode.

## v3 (M4): region co-editing

Status: contract in `tmp/briefs/office-next/plan-m4.md` ("Shell ↔ fork"); room protocol in erpcons-office-server
`docs/openapi.yaml`, "Co-editing (M4)". Shell side: `editor-shell/online-regions.js` (locks, updates, acks, replay,
cursors, conflicts) and `online-leader.js` (who saves, and when).

`erpHost.version` stays `2`: the v3 calls are added to the same object, so a v2 fork keeps working unchanged. Detection
goes by feature both ways: a fork uses region co-editing when `typeof erpHost.regionWillEdit === 'function'`, and the
shell treats a fork as v3 when the handlers it gave to `ready` include `applyRemote`. Without `applyRemote` the shell
keeps the M3 behaviour (whole-file saves, presence in the bar only) and never sends a region message for that page.

### Editor → shell

```js
erpHost.regionWillEdit(regionId)          // → Promise<boolean>: may this page edit the region now?
erpHost.regionChanged(regionId, payload)  // after each finished edit step of that region
erpHost.regionDidEndEdit(regionId)        // the user left the region (caret moved away, inline editor closed)
erpHost.selectionChanged(regionId, range) // caret or selection, for the other people's cursors
```

- `regionId` and `payload` are strings the fork defines (table below). A payload is the region's **whole** content
  in the fork's own serialisation, never a delta: the shell coalesces the calls of 150 ms into one `region.update` and
  may replace an unsent payload with a newer one. A `region.update` over the room's `limits.max_region_message_bytes`
  (default 1 MiB) stays on this device with the notice "Một thay đổi quá lớn để gửi…"; it reaches storage only
  through this page's own save while it is the leader.
- `regionWillEdit` resolves `true` once the room granted the lock (renewed every 2 s by the shell while the region is
  edited or has unsent changes, released after `regionDidEndEdit` once its changes are acknowledged), `false` when
  someone else holds it or the page may not edit. Without a room (offline, still joining, no live channel) it resolves
  `true` at once: the edit is kept and synced after the join, under the conflict rule below. The fork asks before the
  first change of a region and does not change it on `false`.
- `range` is a string the fork defines (its own selection encoding). The shell sends at most one cursor per 100 ms,
  in `edit` and `comment` mode only.

### Shell → editor (handlers given to `ready`, all optional except `applyRemote` for v3)

```js
applyRemote(regionId, payload, author)  // a region's content as the room has it now
showPresence(members)  // [{ id, kind, name, colour, mode, state, person, you }]
showLocks(locks)       // [{ region, holder, name, colour, mine }]: the whole table each time
showCursors(cursors)   // [{ author, name, colour, region, range }]: the whole set each time
lockDenied(regionId)   // a lock this page was editing under is gone (lapsed or taken over)
isLeader(flag)         // this page is (no longer) the room's leader
regionConflict(regionId) // → 'mine' | 'theirs' or a Promise of it (below)
```

- `applyRemote` is called once per room seq, in seq order, and also with this page's own payload when a conflict
  answer `mine` must restore it after a reload. The fork applies it synchronously as one step that is not on the
  user's undo stack (an earlier own undo step of that region is skipped, plan-m4 "Undo theo người"), marks the document
  dirty and keeps the view. `author` is the room member id, to be looked up in `showPresence`.
- `person` groups the tabs of one person; `you` marks this page's member. Names may be empty (anonymous link viewer).
- **Conflict:** edits made while the page had no room are sent after the join, each once its region's lock is granted.
  When the room changed that region meanwhile (replay, or a reload after `REPLAY_GONE`), the shell asks
  `regionConflict(regionId)` for each such region, one at a time ("Giữ bản của tôi" / "Dùng bản mới"). `mine` sends
  this page's edit; `theirs` drops it and calls `applyRemote` with the room's content. An answer that is neither, a
  throw or a rejection counts as `mine`. A fork without `regionConflict` gets the shell's dialog, which asks once for
  all the regions ("Có N chỗ người khác vừa sửa"); closing it some other way also means `mine`.

### Saving in a room

- Only the room's leader stores the document: 30 s after the last change in the room (at the latest every 2 minutes
  while changes never pause), at once on `save.request`, on Ctrl+S (`reason: 'manual'`) or `flush`, when it leaves as
  the last editor and on `pagehide` (best effort). Its PUT carries `X-Live-Seq` with the last room update its bytes
  hold, so the server never stores content older than what it has.
- The fork keeps calling `save` as in v1. On a page that is not the leader the shell answers `saved` (with the current
  version) as soon as the room has acknowledged every region edit those bytes contain, and `offline` until then; it
  sends no PUT. The bytes stay in the pending store until the room has them, as for any unsaved change.
- A v2 fork in a room with several editors: a page that is not the leader holds its save (`offline`, "Đang có người khác
  cùng sửa…") instead of the server's `NOT_LEADER`, and stores it once it leads or edits alone.
- The shell re-reads the document when the room says another page stored a newer version, so the leader's next save
  names the right ETag. A rejoin after `REPLAY_GONE` (updates older than the last save are gone) calls `open` with
  `preserveView: true` and the latest stored content; edits not yet acknowledged are then checked under the conflict
  rule and sent as new updates (the old room's `cid`s are never reused).

### Region ids

| Fork | Regions | Order lock (taken for structural edits) |
|---|---|---|
| PDF | `annot:<NM>`, `field:<full field name>` | `pages` |
| Trình chiếu | `shape:<slideId>:<shapeId>`, `slide:<slideId>` | `slides` |
| Bảng tính | `cell:<sheetId>:<A1>` (payload carries the sheet's structure counter) | `sheet:<sheetId>` |
| Văn bản | `para:<paraId>`, `table:<paraId>` | `*` (the 36 whole-document commands of the spike) |

The ids rest on the stable ids of M3 (`setClientId`). Each fork lists its exact payload format in its own
`ERPCONS-CHANGES.md`; the shell never reads a payload.

### Tests each fork adds (v3)

With a fake `erpHost`: no change to a region after `regionWillEdit` resolved `false`; `regionChanged` after each step
with the whole region; `applyRemote` applied once, not undoable, view kept, document dirty; `lockDenied` ends the
inline edit without losing typed text; `regionConflict` both answers; a v2 shell (no `regionWillEdit`) keeps v2 saves.

## v3 (M5): anchored comments

Status: plan `tmp/briefs/office-next/plan-m5.md`; server contract in erpcons-office-server `docs/openapi.yaml`,
"Comments". Shell side: `editor-shell/online-comments-api.js` (HTTP), `online-comments-state.js` (anchors, order,
sections, rights), `online-comments-panel.js` (the "Nhận xét" panel) and `online-comments.js` (composition, live refresh,
editor calls).

Comments live on the server, never in the file: the fork must not write them into the document it saves, and comments
already in the file (DOCX/XLSX/PPTX comments, PDF annotations) stay content, separate from these. Detection goes by
feature, as for regions: the shell calls each handler below only when the fork gave it to `ready`. A fork without
`anchorOfSelection` still gets a working panel: every new thread is document-wide (anchor `{ "kind": "document" }`) and
reads "Nhận xét chung".

Who sees what (plan-m5, "Quyền"): owner, editors and commenters see and add comments; owner and editors also resolve,
reopen and delete whole threads (the list's `can_resolve`); everyone edits and deletes only their own comments.
Viewers, link holders and version pages (`&version=`) get no comments at all: no panel, no bar buttons, no request and
an empty `showComments([])`. Adding needs `edit` or `comment` mode; an editor kept in `view` by the live room's editor
limit still reads them.

### Anchors

An anchor is a JSON object the fork defines (at most 8 KiB compact), stored by the server as it is and handed back
unchanged. The shell reads only these optional fields:

| Field | Type | Use |
|---|---|---|
| `region` | string, 1–256 bytes | the stable region id (table in v3 above); sent as the thread's `region` |
| `order` | array of 1–8 finite numbers | the position key the panel sorts placed threads by, compared element by element (Văn bản `[block, offset]`, Bảng tính `[sheet, row, col]`, Trình chiếu `[slide, shape z]`, PDF `[page, y, x]`) |
| `quote` | string | the text shown above the thread (Văn bản: the selected text; Bảng tính: `Sheet1!B4`; Trình chiếu: the slide title and shape; PDF: the text under the quads); cut at 200 characters |
| `kind` | `'document'` | reserved: a thread without a place |

Everything else is the fork's own: the position inside the region and the soft anchor of plan v2 §6 (Văn bản the text
plus 32 characters on each side; Bảng tính the cell's value or formula; Trình chiếu the slide title and shape id; PDF
page, quads and text). The fork lists its exact anchor format in its `ERPCONS-CHANGES.md`.

### Editor → shell

```js
erpHost.commentClicked(threadId)  // the user clicked a thread's mark in the document
```

The shell opens the panel on that thread (under "Đã xử lý" when it is resolved).

### Shell → editor (handlers given to `ready`, all optional)

```js
anchorOfSelection()            // → anchor | null (or a Promise of it): the place of a new thread
showComments(threads)          // [{ id, anchor, status }]: every placed thread, the whole set each time
focusAnchor(anchor, threadId)  // scroll to the anchor and highlight it
resolveAnchors(threads)        // → [{ threadId, anchor?, status? }] (or a Promise of it)
```

- `anchorOfSelection` is called on "Thêm nhận xét" (bar or panel) and Ctrl+Alt+M (Cmd+Option+M), in `edit` and
  `comment` mode only. `null` means nothing is selected: the shell shows "Chọn nội dung để nhận xét" and opens nothing.
- `showComments` carries no names or words. `status` is `open`, `resolved` or `orphaned`; the fork draws a mark for
  each `open` thread it can place and none for the others. It places them itself, with the same rules as
  `resolveAnchors`, every time the content changes. Called after the fork opened the document (`opened(…, true)`) and
  whenever that list changes.
- `focusAnchor` follows a click on a thread in the panel and a deep link `?doc=<id>&comment=<thread>` (the mails' link);
  the shell waits for `opened` before calling it.
- `resolveAnchors(threads)` (same entries as `showComments`) asks the fork to place every thread again on the content it
  now shows and to return only what changed: a new `anchor` (same shape, updated position and soft anchor) and/or a
  `status` of `open` (found again) or `orphaned` (region gone and the soft anchor not found). The region id comes first,
  then the soft anchor. A resolved thread keeps its status. The shell calls it 1.5 s after the fork opened a new version
  (`open`, also with `preserveView`) and after a burst of `applyRemote`, and sends the changes as one
  `PATCH /documents/{id}/comments/anchors` (batches of 200). Only one page does this for everyone: the live room's
  leader, or every page while no one leads (no room, or nobody editing).

### Live refresh

The room sends `comments.changed { thread_id }` (never the content) to the members who may read comments: the shell
reads that thread again (gone: removed), or the whole list when `thread_id` is null, and after every rejoin. A page
without a live room reads the list again on its 30 s check.

### Tests each fork adds (v3 comments)

With a fake `erpHost`: `anchorOfSelection` null without a selection and an anchor with `region`, `order` and `quote`
for each selection kind; a saved file holds no server comment; `showComments` draws marks only for `open`;
`focusAnchor` scrolls to the place; `resolveAnchors` keeps an anchor whose region moved, follows the soft anchor when
the region id changed, returns `orphaned` when both are gone and nothing for an unchanged thread; a click on a mark
calls `commentClicked` with its thread id.

## Tests each fork adds

Unit/headless tests in the fork for rules 1–6 and 10–11 with a fake `erpHost` (revision passed and acknowledged,
`acknowledged` after `offline`, an older `acknowledged` ignored, coalescing, no retry on conflict, dirty after an
in-flight edit, `opened` reason keys, flush resolving without waiting for answers). The shell has vitest coverage for the HTTP mapping; the integration
E2E (Playwright, `pi-mock` + server + site) covers save, reload, two-tab conflict, offline and unload.
