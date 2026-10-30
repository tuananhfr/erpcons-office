# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

ERPCons Văn phòng (`office.erpcons.ai`): a static Next.js site that hosts four Rust/WASM editors
built from sibling forks. This repo writes no editor code; it builds the forks, copies their
`dist/web/` into `out/<slug>/`, and injects the ERPCons shell into each editor page.
No backend: user files never leave the browser.

Workspace layout (resolved by `src/lib/build/workspace.ts`, override with `ERPCONS_WORKSPACE`):

| Dir (sibling of this repo) | Role |
|---|---|
| `wordcraft`, `gridcraft`, `deckcraft`, `pdfcraft` | Editor forks, branch `tuananhfr`. Each has its own CLAUDE.md/AGENTS.md; ERPCons-specific changes are logged in its `ERPCONS-CHANGES.md` |
| `craft-fonts` | Font repo clone; `craft-fonts-refs/<sha>` are worktrees pinned per fork |

## Commands

- `npm run dev` — landing only, port 3010 (`predev` records sizes of whatever fork builds exist).
- `npm run build` — `trunk build --release` in all 4 forks → `next build` → `scripts/assemble.mts`.
- `npm run build:site` — same, reusing existing `<fork>/dist/web` (no Rust rebuild).
- `npm run preview` — serves `out/` like the Apache target (br/gz, wasm MIME, cache headers), port 3011.
- `npm run sbom` — CycloneDX SBOMs of the 4 editors' web crates (wasm32, `cargo cyclonedx`) and the site's npm production deps into `sbom/` (gitignored, never deployed), named `<name>-<sha>.cdx.json` and listed in `sbom/index.json`.
- `npm test` · `npm run lint` · `npm run typecheck`
- Single test: `npx vitest run src/lib/build/fork-guard.test.ts` (or add `-t "<name>"`).

Full builds need `trunk` + the wasm32 Rust toolchain on PATH; the `build/` image provides both.

## Build pipeline (the non-obvious parts)

- `scripts/build-editors.mts` refuses to build a fork that is not on branch `tuananhfr`
  (`fork-guard.ts`: only that branch has ArtCraft branding removed), and fails if `dist/web`
  contains ArtCraft marks — except the two allowed credit phrases. With `--allow-missing`
  (dev) leaks only warn.
- Fonts: the craft-fonts commit is read from each fork's `.github/workflows/release.yml`
  (`craft-fonts-ref`); a missing worktree is created via `git worktree add`, and
  `CRAFT_FONTS_REQUIRED=1` turns build.rs's silent no-fonts fallback into an error.
- Writes `src/generated/editor-sizes.json` (gitignored), shown on the landing.
- `assemble.mts`: `installEditor` injects in memory before replacing `out/<slug>/`; then
  fills `editor-shell/sw.js` with a hashed asset manifest (build id changes only when `out/`
  does) and precompresses.

## Architecture

- `src/config/editors.ts` is the single registry of the 4 editors (slug, fork, `canvasId`,
  `loadingId`, SEO). Landing cards, sitemap, assembly, keys and tests all derive from it.
  `canvasId`/`loadingId` must match the fork's `index.html`.
- `src/lib/editor-shell/inject.ts` rewrites a trunk-built `index.html` (pure function, tested):
  `lang="vi"`, SEO tags, manifest, the 40px `.erp-shell` bar, and the canvas pushed below it.
  It is idempotent (`data-erpcons-shell`) and throws if the page shape changes upstream.
- `editor-shell/*.js` are plain-ES5 IIFEs concatenated in order by `assets.ts`
  (`shell → account → account-ui → viewport → file-picker → intake → open-file → share → keys → drafts → drafts-ui → host-bridge → crash-guard`)
  into one inline `<script>`, after `window.erpEmbedHosts` (from `src/config/embed.ts`), `window.erpMimeTypes` (from
  `src/lib/files/mime-types.ts`, shared with the landing picker), `window.erpIntakeContract` (from
  `src/lib/files/intake-contract.ts`) and, only with PI sign-in on, `window.erpPi`; no
  bundler, no TS. Tests run them in node against fakes (`fake-idb.ts`, `fake-browser.ts`, `fake-pi.ts`; online:
  `fake-dom.ts`, `fake-office.ts`, `online-harness.ts`).
  - Phones: inject.ts adds `viewport-fit=cover, interactive-widget=resizes-content` to the fork's viewport meta;
    shell.css owns the safe-area vars (`--erp-inset-*`, zeroed when embedded) and `--erp-top`/`--erp-bottom`
    that the bar, canvas and overlays use. `viewport.js` sets `--erp-keyboard-h` from `visualViewport` (iOS
    keyboard); `file-picker.js` appends MIME types to rfd's extension-only `accept` before the native click (iOS).
  - `intake.js`: `window.erpIntake` (also inlined into sw.js): states, error codes, the one code → Vietnamese
    message table, signature sniffing, bidi stripping and queue pruning, all read from `erpIntakeContract`.
    The contract (limits, accepted formats from each editor's `accepts` in `editors.ts`) is the single source for
    the manifest, the landing picker, `pending-file.ts`, the worker and the `/nhan-tep/` batch page.
  - `open-file.js`: landing/share → editor file handoff via IndexedDB `erpcons-file-transfer-v1`
    + `?open=<id>[,<id>…]`, delivered as a synthetic `drop` on the canvas; bytes stay queued until the fork reports
    `window.erpIntakeResult(name, size, ok)` (see `docs/file-transfer.md`). Also handles PWA `launchQueue` ("Open with").
  - `share.js`: `window.erpCanShareFiles(mime?)` / `window.erpShare(bytes, name, mime)` for the forks' "Chia sẻ"
    export (Web Share, download fallback; off when embedded).
  - `keys.js`: blocks browser defaults (Ctrl+R/L/D, F5…) eframe doesn't cancel; never clipboard keys.
  - Clipboard (web): no shell JS. Each `apps/<fork>-web/src/clipboard.rs` (Word, Grid, Deck) listens for `paste`
    in the capture phase (text/html, text/rtf, text/plain, images) and writes `ClipboardItem` on copy; the
    Paste button/menu uses `navigator.clipboard.read()`. The Ctrl/Cmd+C/X/V key layer is off on web to avoid
    double paste. PDF only has a Copy float (honours no-copy) and "from clipboard" create. Rationale: `docs/adr/clipboard-web.md`.
  - `drafts.js`: exposes `window.erpDrafts`, the draft store the forks' web builds autosave into
    (see each fork's `ERPCONS-CHANGES.md`); disabled when embedded (`?host=parent` or
    `?embed=erpcons`), where the host page owns recovery.
  - `host-bridge.js`: ERP embedding (`?embed=erpcons&parent=<origin>`, origin must be in
    `erpEmbedHosts`): postMessage protocol v1 in `docs/erp-embed.md`. It identifies the document
    by file name only, so two open documents with the same name are ambiguous.
  - `account.js`: optional PI ID sign-in (contract in sibling `erpcons-account/docs/`), behind
    `PI_ACCOUNT_ENABLED` in `src/config/pi.ts` (on, issuer `https://platform.pih.vn`). Always installs
    `window.erpAccount` v1 (shape in
    `src/lib/account/types.ts`, read later by the forks); without `window.erpPi` or when embedded it is a guest with
    built-in tiers and no network. Popup sign-in (`/dang-nhap/`, `/dang-nhap/callback/`, written by assemble only when
    enabled; same script), refresh token in localStorage (rotated under Web Locks), access token in memory, shared
    with other tabs over BroadcastChannel. The landing inlines the same file from `app/layout.tsx`. Bridged to the real PI
    Platform: endpoints come from `window.erpPi` (PI discovery has no CORS), the active org from PI's `/api/v1/id/me`,
    and an org switch re-opens the popup with `org_hint` (PI never switches on refresh).
    `account-ui.js` fills the bar slot inject.ts adds only when enabled. `erpAccount.apiFetch(path, init)` is the only
    way to call the Office API: same-origin `/api/v1/…` paths only (throws otherwise, before any request), access
    token attached, one refresh + retry on 401, then `unauthenticated`.
  - Online documents (`docs/erp-host.md`, `docs/adr/online-tier.md`): `ONLINE_ENABLED` in `src/config/online.ts` (on;
    needs `PI_ACCOUNT_ENABLED` too). Only then `assets.ts` adds `ONLINE_SCRIPTS` before `host-bridge.js`: parts
    `online-backoff/api/pending/state/mode/dialogs/saver/open/watch/host/bar/panel/link.js` on `window.erpOnline`,
    composed by `online.js`, which defines `window.erpHost` v2 for a signed-in user on `/<editor>/?doc=<id>`
    (`&version=<seq>` read-only) and, via `online-link.js`, for anyone on the public link `/<editor>/#link=<token>`
    (never when embedded). The bar's "Chia sẻ" / "Lịch sử" open `/tai-lieu/chia-se/` and `/tai-lieu/lich-su/` (the same
    React dialogs as `/tai-lieu/`) in a same-origin frame that answers by `postMessage` (`online-panel.js`). Phase 2
    has no live channel: `online-watch.js` re-reads the document every 30 s while visible. Pending
    unacknowledged bytes live in IndexedDB `erpcons-online-pending`. Local QA/E2E build: `ERPCONS_LOCAL_ONLINE=1`
    turns PI + online on in `assemble.mts`, and only together with `ERPCONS_ALLOW_LOCAL_PROVENANCE=1`, which build-info
    records and the deploy refuses. `ERPCONS_LOCAL_PI_ISSUER=<origin>` (same guard) points PI at a local issuer such
    as pi-mock. `src/config/site-flags.ts` resolves these flags for `next build` and `assemble.mts` alike (pass the env
    to both). `ERPCONS_API_PROXY=http://127.0.0.1:<port>` makes `npm run preview` proxy `/api/`.
  - "Tài liệu của tôi" `/tai-lieu/` (`app/tai-lieu/page.online.tsx`, `src/components/documents/`,
    `src/lib/documents/`; tabs folder / `#chia-se` "Được chia sẻ với tôi" / `#thung-rac`; share dialog in `share/`,
    version history in `versions/`, the editor's frame pages in `panel/`): `next.config.ts` adds the `.online.tsx` page
    extension only when the online flag is on, so with it off the route and its code are not built (locked by
    `site-flags.test.ts`). The share link's token is memory-only (never stored, logged or put in the page URL). The header link and the
    landing's "Đăng nhập để lưu online" line follow the same flag.
  - Sign-up `/dang-ky/` and `/dang-ky/xac-minh/` (`app/dang-ky/**/page.online.tsx`, `src/components/signup/`,
    `src/lib/signup/`): same online flag. Plain same-origin `fetch` to `/api/v1/signup` (no PI token, never
    `apiFetch`); the form rules mirror the server's `crates/signup/src/input.rs`. The verification token arrives as
    `#token=`, is removed from the address bar at once and kept in memory only. With PI sign-in on, the desktop
    download section shows "Đăng nhập để tải" until signed in (a courtesy gate: installers stay public).
  - `crash-guard.js`: a wasm trap / OOM / eframe panic ("panicked at" on `console.error`) shows a
    blocking "reload" dialog with the last draft time; embedded, it also posts `crashed`.
  - `sw.js`: network-first for pages, cache-first for assets, keeps old-build files while a tab
    of that build is open. The public view link keeps its token in the fragment (`#link=`, removed from the address bar
    at once, sent only as `X-Link-Token`), so no request or cache key carries it. It also answers the manifest's `share_target` (POST `/share-target/`, up to 5 files):
    files join the same `pending` queue as the landing picker under one `batchId`, then a 303 to
    `/nhan-tep/?batch=<id>`, which waits for the user's click. Only a same-origin referrer with exactly one valid
    file goes straight to `/<editor>/?open=<id>`: the OS share sheet and a cross-site page that strips its referrer
    are indistinguishable, so neither may open an editor by itself. `assemble.mts` fills its
    `/*__INTAKE__*/` placeholder with the contract and `intake.js`.
    `/dang-nhap/*`, `/api/*` and requests with an `Authorization` header are never cached (OIDC code, per-user data).
- Editors open in a new tab from the shell nav: navigating away would drop the unsaved document.
- Links between exported pages are plain `<a>` (static hosting, no RSC rewrites).

## Conventions

- UI copy is Vietnamese. The editors default to Vietnamese too; the choice is shared across
  editors in `localStorage` `erpcons-ui-language` (each fork's `language.rs`). Terms follow
  `docs/glossary-vi.md` (Office VN feature names, clean-room sentences).
- `docs/gap-register.md` tracks what is still missing against the FULL V4 spec, by wave.
- Manual checks that machines cannot do (real Word/Excel, phones, Safari/Firefox, screen readers) live in
  `docs/manual-qa-v2.md`; measured timings in `docs/benchmarks.md`.
- Production is Apache 2.4, vhost `office.erpcons.ai` (`/etc/apache2/office.erpcons.vn.inc`: compression, MIME, cache).
  The include and `/var/www/office.erpcons.vn` keep the old domain's name; `office.erpcons.vn` only redirects.
  Deploy model: rsync a release dir, switch the `current` symlink, keep 3, roll back by symlink
  (the scripts that did this are lost, see "Gate and local builds").
- Fork changes belong in the fork on branch `tuananhfr` and are recorded in its
  `ERPCONS-CHANGES.md`. The forks' own notes say "push to `main`" — that is upstream's flow;
  here `main` is untouched upstream. `../../craftrules` referenced by the forks is not checked out.
- Never reintroduce ArtCraft names/logos/links (brand terms); the build gate enforces it.
- Design spec and history: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
  UI QA screenshots/reports go to `.qa/` (gitignored).

## Gate and local builds (Docker, `build/`)

GitHub Actions minutes are not relied on: every cargo, wasm and Windows compile runs in the pinned Linux image
`build/Dockerfile` (Rust 1.99.0, trunk, cargo-xwin, node, gh), started from Git Bash with `build/run.sh <step> ...`.
The workspace is mounted at `/ws`; cargo targets (one per checkout: `/target/<fork>`, worktrees `/target/wt/<name>`;
a shared dir links stale crates from another checkout of the same version), cargo, trunk/xwin and npm caches and this
repo's `node_modules` live in Docker volumes. `build/run.sh test <fork> [--dir tmp/<wt>] <cargo test args>` runs tests. Working trees must be LF (`core.autocrlf=false` per repo):
a CRLF checkout leaks `\r` into `include_str!` data and breaks rustfmt and tests in the container.

- `build/run.sh gate <fork> [--no-wasm]`: the fork's CI Linux gate (rustfmt on files changed since the last
  `erpcons-v*` tag or `GATE_BASE`, workspace clippy `-D warnings` and tests as in `cargo xtask ci`, wasm clippy); logs in `build/logs/`. Each fork has
  known baseline failures (listed in its ERPCONS-CHANGES.md); anything new fails the gate.
- `build/run.sh desktop-win <fork>`: refuses a dirty tree, cross-builds `<fork>.exe` and `<fork>-cli.exe`
  (`x86_64-pc-windows-msvc`, static CRT, icon/VERSIONINFO checked) into `<fork>/target/x86_64-pc-windows-msvc/release/`.
  Then on the host: `pwsh <fork>/packaging/windows/package.ps1 -Arch x64 -SkipBuild` (WiX 5.0.2 as a dotnet tool).
  The host is Windows 11 Home (no Windows containers), so WiX packaging cannot move into Docker.
- `build/run.sh prune [--dry-run]`: keeps all cargo targets (the volume plus `target/` dirs of workspace checkouts) under
  `ERPCONS_TARGET_BUDGET_GB` (120): drops targets whose checkout is gone, keeps the 2 newest builds of each test/bin
  binary, then evicts least recently used targets. Targets locked by cargo or written in the last 30 min are left alone.
  It runs from `use_target` before each fork step (at most every 30 min) and hourly from the Windows task
  "ERPCons cargo prune" (log `build/logs/prune.log`). `run.sh` sets `CARGO_PROFILE_{DEV,TEST}_DEBUG=line-tables-only`:
  full debuginfo made each test binary 0.4–0.9 GB.
- Web release and deploy: the previous machine's WSL scripts (`release.sh`, `~/deploy-office.sh`,
  `~/rollback-office.sh`) are lost and not yet replaced. Production (`office.erpcons.ai`) is 69.62.73.66.

Production QA runs Playwright against `https://office.erpcons.ai` (`QA_ORIGIN` overrides). Playwright quirks: no
`deviceScaleFactor` emulation on the eframe canvas, typed first uppercase/diacritic char can be dropped (type
lowercase), no `insertText`.

## Desktop suite

`packaging/suite/` repackages the four forks' released installers without building Rust.
After all four forks have released, run `.github/workflows/desktop-suite.yml` on `tuananhfr`
in `tuananhfr/erpcons-office`. Optionally supply a version (`YYYY.MM.DD`, or `YYYY.MM.DD.N` for another release the same day; defaults to today UTC).
The workflow verifies upstream SHA-256 checksums, tests the packages, and publishes `vanphong-v<version>`;
existing tags are refused. Pushes to `installers/**` only build, test and upload artifacts.

Suite security: repository variable `ERPCONS_REQUIRE_SIGNING=true` requires Windows setup signing and
`Get-AuthenticodeSignature` status `Valid` before upload. Default unset preserves unsigned packaging.
Secrets: `WINDOWS_CERTIFICATE` (base64 PFX), optional `WINDOWS_CERTIFICATE_PASSWORD`, or all of
`AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_SIGNING_ENDPOINT`,
`AZURE_SIGNING_ACCOUNT`, `AZURE_CERT_PROFILE`. Optional `WINDOWS_TIMESTAMP_URL` overrides timestamping.
The suite has no macOS notarization tooling yet: with the gate enabled the macOS job fails closed.
Use `ERPCONS_SKIP_MACOS=true` to ship only the five Windows/Linux packages. Do not enable macOS signed
releases until Developer ID signing, notarization submission, stapling and Gatekeeper verification are implemented.
Each suite release also attaches `sbom.cdx.json`, aggregating published fork CycloneDX BOMs or explicitly
listing release artifacts from SHA256SUMS.txt and tags when dependency BOMs are unavailable.

Site builds write `/build-info.json` (site SHA, four fork provenance records and wasm/js SHA-256 hashes)
and `/sbom.cdx.json` (npm production dependencies; excluded from precache). Fork builds write
`dist/web/build-provenance.json` with full SHA, branch, dirty flag, workspace version, tool versions and time.
Reused builds must match clean current fork HEADs, including during assembly. Missing provenance requires
an editor rebuild. Local experiments can set `ERPCONS_ALLOW_LOCAL_PROVENANCE=1` for the whole pipeline
(or pass `--allow-local-provenance` to both scripts); build-info records the override. Never use it for deployment.
