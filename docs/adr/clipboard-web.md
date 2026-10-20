# ADR: Clipboard bridge for the web editors

Status: accepted 2026-10-20 (owner approved plan V2-1). Scope: Văn bản, Bảng tính, Trình chiếu (PDF only reads plain text).

## Problem

The web builds run on eframe 0.36. Its web backend reads `ClipboardEvent.clipboardData.getData("text")` only and writes with
`navigator.clipboard.writeText`. So on the web every editor trades plain text with other applications: rich content pasted from
Word, Excel, LibreOffice or Google Docs loses its formatting, copied tables and shapes leave nothing useful, and the ribbon Paste
button cannot read the system clipboard. In Văn bản and Trình chiếu one Ctrl+V runs the paste command twice: the key event
reaches the keymap and the browser's `paste` event runs it again. Desktop builds are not affected because they read the system
clipboard through arboard. The engines already have HTML importers (Văn bản, Bảng tính) and `Services` hooks for rich clipboard
data; only the web shells never feed them.

## Decision

Each web app gets a small module, `apps/<fork>-web/src/clipboard.rs`, with the same shape in all three forks:

1. **Paste.** A `paste` listener on `window`, capture phase, runs before eframe's listener on `document`. It reads `text/html`,
   `text/rtf`, `text/plain` and image files synchronously (the data is only valid inside the handler), stops propagation and
   queues one `PendingPaste` for the next frame. The app's `raw_input_hook` turns it into a single `egui::Event::Paste(plain)`,
   so text fields in dialogs behave as before, and exposes the rich parts through the existing `Services` clipboard hooks for the
   document paste command. A clipboard that holds only HTML or only an image still pastes (plain text is derived from the HTML).
2. **No double paste.** On the web the app drops Ctrl/Cmd+C, X and V key events before the keymap sees them; the browser always
   follows with copy, cut or paste events, which are the single source of truth.
3. **Copy and cut.** The app writes one `ClipboardItem` with `text/html` and `text/plain` (`navigator.clipboard.write`) from the
   copy command, and must not let eframe's own `writeText` overwrite it afterwards. A failed write shows a toast instead of a
   console line. Where `ClipboardItem` is unsupported it falls back to plain text, as today.
4. **Paste button, context menu, touch.** They call `navigator.clipboard.read()` and push the result through the same
   `PendingPaste` path. If the browser refuses, the user sees: "Trình duyệt không cho đọc bảng tạm — hãy dùng Ctrl+V".
5. **Copy between two tabs of the same editor.** The HTML written by copy carries `<meta name="erpcons-clip" content="…">`
   holding the editor's own serialized fragment (versioned, size-capped). Paste in the other tab recognises it and restores
   styles, numbering and media exactly. This replaces recognising our own copy by comparing plain text.

## Threat model

- Clipboard HTML is untrusted. It is never inserted into the page DOM and never evaluated: Rust parses it into the document
  model. Scripts, event handlers, `javascript:` and `data:` links, external resources and `<style>` rules that fetch
  anything are dropped or ignored; only an allow-list of tags and CSS properties maps to formatting. No network request is made
  while parsing.
- Size limits: HTML 8 MB, 20 000 table cells, nesting depth 64, image 20 MB; over the limit the paste falls back to plain text with a notice.
- The embedded `erpcons-clip` payload is data, validated and bounded like a file; a bad payload is ignored and the HTML is used.
- Clipboard content is never logged, never sent anywhere, never persisted by the bridge (drafts store documents, not clipboards).
- Reading needs a user gesture; the Paste button may trigger a browser permission prompt. Ctrl+V needs none.
- Unsupported objects (OLE, charts, SmartArt) are dropped with a visible notice, never silently.

## Consequences

- Same module name and shape in three repos, so a fix lands the same way three times. A shared crate was rejected for now: the
  forks track upstream separately and the glue is small.
- Safari and Firefox limit `clipboard.read()` and delayed `clipboard.write()`; they keep the plain-text behaviour where unsupported.
- Not verifiable with real Word/Excel/LibreOffice/Google Docs or on iOS/Android in this environment: those cases are listed in
  `docs/manual-qa-v2.md` for manual checks.

## Verification

Native tests cover the pure logic (event to raw input, marker encode/decode, key dropping). A Playwright check on a built preview
covers the browser path: crafted Word, Excel, Google Docs and LibreOffice HTML, XSS HTML, two tabs, Undo count, 10 000 characters
and a 500-row table. Golden tests save the pasted result to OOXML and compare run, paragraph and table properties.
