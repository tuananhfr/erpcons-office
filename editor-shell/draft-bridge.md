# Device draft bridge v2

`window.erpDrafts.version === 2` adds an optional `state` call to the existing
`put(key, name, format, Uint8Array)`, `remove(key)` and `ready(restore)` contract.
`put` now returns `Promise<boolean>`: true on transaction commit, false on failure
(including unavailable storage). Await it before sending committed/failed; legacy callers
may ignore the return value. The IndexedDB record schema remains v1. Editors without `state` retain the global
save badge. Embedded (ERP iframe) recovery is the editor's own: see the fork's
`packaging/web/README.md` "Embedded document recovery" (`init` with `docId`, `drafts: "host"|"local"`).

Each fork (Word, Grid, Deck, PDF) must feature-detect `erpDrafts.state` and call:

```js
window.erpDrafts.state({ docId, name, revision, dirty, pending, committed, failed })
```

- `docId`: stable string, identical to the `put`/`remove` key; use the adopted id on restore.
- `name`: current display name; `revision`: nonnegative safe integer increasing on every edit.
- Edit: `dirty: true, pending: false, committed: false`.
- Checkpoint start: `dirty: false, pending: true, committed: false`.
- Checkpoint commit: all false except `committed: true`, only after IndexedDB transaction completion.
- Checkpoint failure: `dirty: true, pending: false, committed: false, failed: true`.
- Active tab switch: resend the selected document's current revision and flags.
- Clean document / close: send all flags false; before closing an inactive document,
  clear its state, then resend the active document. Clear `failed` on retry/success.

Every state call selects the active document. Background completions must resend
the active document immediately afterwards. Never mark a newer revision committed
because an older checkpoint completed. Older revisions are ignored. `dirty` here
means edits absent from the device draft, independently of the file's disk-save state.
A pending or failed checkpoint in any document blocks the update button.

The shell keeps the running editor on worker activation and never reloads it.
A waiting worker activates only on the user's update action once every draft is
safe. Drafts remain in IndexedDB for recovery on the next navigation. Legacy
editors are guarded by outstanding `put` transactions, including queued writes.

`put` uses a single atomic IndexedDB readwrite transaction: the structured-cloned
replacement becomes visible only at commit. Abort (including quota failure)
retains the previous record byte for byte; no delete or quota eviction is used.
