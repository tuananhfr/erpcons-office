# Local file handoff

Files reach an editor from three places: the landing picker, the OS share sheet (installed app, `share_target`) and
"Open with" (installed app, `file_handlers` + `launchQueue`). None of them posts a file to a server.

## One contract

`src/lib/files/intake-contract.ts` is the single source for limits, states, error codes, the code → Vietnamese message
table, file signatures and accepted formats. Accepted extensions come from each editor's `accepts` in
`src/config/editors.ts`; the manifest's `file_handlers` and `share_target` accept lists, the landing picker `accept`,
`pending-file.ts` and the worker's routing are all derived from it. The contract is serialised into the page script as
`window.erpIntakeContract` and into `sw.js` as `self.erpIntakeContract`; `editor-shell/intake.js` runs on both and
exposes `erpIntake` (validation, records, pruning, IndexedDB helpers).

Limits: 5 files per share and 200 MiB per batch (`QUOTA_EXCEEDED`), 100 MiB per file (`TOO_LARGE`), entries expire
after one hour. Every user-facing error
ends in `(Mã: CODE)`.

Signature check on the first 1 KB: the Word family accepts ZIP, OLE or RTF (WordCraft opens by content: RTF saved as
.doc, password-protected OOXML is OLE); sheets ZIP or OLE; ODF and PowerPoint ZIP only; PDF needs `%PDF-` within the
first 1 KB; TXT, MD, CSV and TSV are not checked. A PowerPoint-family name whose bytes are OLE (password-protected
PPTX, or a legacy PPT renamed) gets its own message (`encryptedPresentation`, `UNSUPPORTED_TYPE`). File names are shown
with bidi controls stripped.

## Queue

IndexedDB `erpcons-file-transfer-v1`, store `pending`, key `id`:

    { id, batchId?, position?, sourceMode: 'PICKER'|'SHARE_IN'|'OPEN_WITH', name, claimedMime, size, editor,
      state, errorCode?, reason?, recoverable, createdAt, expiresAt, file? }

States: `VALIDATING → READY → ROUTED` (batch page link followed) `→ DELIVERED` (dropped on the canvas)
`→ OPENED | FAILED_FINAL`, plus `FAILED_RETRYABLE` and `EXPIRED`. Rejected records keep no bytes. Delivered bytes
are kept until the editor reports the result, or for two more minutes when it never does. Nothing runs in the
background: expired entries are deleted the next time the queue is touched (a share, a picker selection, an editor
opened with `?open=`, or the batch page, which keeps its own batch's metadata without bytes once so it can say
"expired").

## Delivery

`editor-shell/open-file.js` reads `?open=<id>[,<id>…]`, checks each record's editor path, expiry and state, and claims
the deliverable ones (`claimedAt`) in the same readwrite transaction, so a second tab opening the same link reports
them as busy instead of delivering them twice; a claim older than 150 s (the claimant died) no longer counts. It
then drops the files on eframe's canvas in one synthetic `drop`. A cancelled drop means eframe took them; the records become
`DELIVERED` and `open` is removed from the URL. If the canvas never accepts within two minutes the records become
`FAILED_RETRYABLE` with bytes kept, so "Thử lại" on the batch page can resend them. Records from older builds (single
id, no state) still open.

The forks report the outcome through `window.erpIntakeResult(name, size, ok)`, once per dropped file after the
editor decided (`ok` false for a parse failure, a refused format or the document limit). The shell matches name and
size against what it delivered: `ok` marks the record `OPENED` and drops the bytes, otherwise `FAILED_FINAL` /
`PARSER_FAILED`, worded without claiming the file is corrupt, since `ok` false has several causes. With no report
within two minutes (a fork without the hook) the record stays `DELIVERED` and its bytes are dropped. `launchQueue`
files are delivered the same way and reported as `OPEN_WITH`, without a queue record.

An editor page cached by an older build only understands a single `?open=` id. Offline right after a deploy, a
batch page link with several ids therefore fails on that old page ("expired") while the records stay in the batch;
once the editor page is fetched fresh the same link works.

## Share in

The manifest's `share_target` posts multipart `file` (plus `title`, `text`, `url`) to `/share-target/`, which
`editor-shell/sw.js` answers without reaching the server. A post whose referrer is another site is refused. The OS
share sheet sends no referrer, so an empty one must be accepted, but a cross-site page that posts with
`referrerpolicy="no-referrer"` looks the same. Such a share therefore never opens an editor by itself: it always lands
on `/nhan-tep/` and waits for the user's click. A cross-site page can still fill the temporary store (at most
200 MB per post, expiring after an hour). Each file
is checked on its own (type, size, signature); file 6 onwards and anything over the batch limit are rejected and stored
without bytes. All records share one `batchId`. Only a post with a same-origin referrer and exactly one valid file
redirects to `/<editor>/?open=<id>`; every other share goes to `/nhan-tep/?batch=<batchId>`, which groups the files
by editor ("Mở N tệp trong <Editor>"), offers
"Thử lại" only for `FAILED_RETRYABLE`, "Chọn lại tệp" and "Hủy lô tệp" (deletes the batch). A share with only a
link (no file) gets a guidance page; the URL is never fetched, logged or shown. `launch_handler` is `navigate-new`.

Share in only works once the worker controls the site, which installing the app guarantees. No tab ever reports
`/nhan-tep/` (only the worker redirects there), so every `erpcons-warm` report also warms it, together with the
scripts, styles and fonts its HTML names; an offline batch share then renders it from the cache, query ignored.

## Share out

`editor-shell/share.js` gives the forks `window.erpCanShareFiles(mime?)` and `window.erpShare(bytes, name, mime)`
(synchronously inside the click; `false` means the fork downloads the bytes itself). Browsers decide per file type
which files they share, so `erpCanShareFiles` probes `navigator.canShare` with a file of the fork's export MIME and
its usual extension, and the command follows that answer. Which browsers accept which types is not assumed here;
the real-device run (`docs/manual-qa-file-access.md`, TC19b) records it. `erpShare` checks `canShare` on the real
file first and returns `false` silently when it is refused (e.g. a macro-enabled variant).
Embedded pages never share. Cancelling the sheet does nothing; a later failure (activation lost) downloads the file
and says so; success shows "Đã gửi bản xuất ‘name’".

## Build

`scripts/assemble.mts` injects the shell script and fills the worker's `/*__INTAKE__*/` placeholder. No Rust changes
are needed for delivery; the result hook and share command live in each fork. Any eframe update affecting drop event
cancellation must be checked with all four editors. Manual checks: `docs/manual-qa-file-access.md`; fixtures:
`node scripts/qa-fixtures.mts` (writes `.qa-tmp/file-access/`, never committed).

The discovery catalog keeps tools without confirmed URLs as awaiting links, without actionable links or pricing claims.

Navigation between exported pages uses ordinary links, avoiding RSC segment rewrite requirements on static hosting.
