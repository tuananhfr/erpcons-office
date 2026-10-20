# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

ERPCons Văn phòng (`office.erpcons.vn`): a static Next.js site that hosts four Rust/WASM editors
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

Full builds need `trunk` + the wasm32 Rust toolchain on PATH.

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
  (`shell → viewport → file-picker → open-file → keys → drafts → drafts-ui → host-bridge → crash-guard`) into one
  inline `<script>`, after `window.erpEmbedHosts` (from `src/config/embed.ts`) and `window.erpMimeTypes` (from
  `src/lib/files/mime-types.ts`, shared with the landing picker); no bundler, no TS. Tests run them
  in node against fakes (`fake-idb.ts`).
  - Phones: inject.ts adds `viewport-fit=cover, interactive-widget=resizes-content` to the fork's viewport meta;
    shell.css owns the safe-area vars (`--erp-inset-*`, zeroed when embedded) and `--erp-top`/`--erp-bottom`
    that the bar, canvas and overlays use. `viewport.js` sets `--erp-keyboard-h` from `visualViewport` (iOS
    keyboard); `file-picker.js` appends MIME types to rfd's extension-only `accept` before the native click (iOS).
  - `open-file.js`: landing → editor file handoff via IndexedDB `erpcons-file-transfer-v1`
    + `?open=<token>`, delivered as a synthetic `drop` on the canvas (see `docs/file-transfer.md`).
    Also handles PWA `launchQueue` ("Open with").
  - `keys.js`: blocks browser defaults (Ctrl+R/L/D, F5…) eframe doesn't cancel; never clipboard keys.
  - `drafts.js`: exposes `window.erpDrafts`, the draft store the forks' web builds autosave into
    (see each fork's `ERPCONS-CHANGES.md`); disabled when embedded (`?host=parent` or
    `?embed=erpcons`), where the host page owns recovery.
  - `host-bridge.js`: ERP embedding (`?embed=erpcons&parent=<origin>`, origin must be in
    `erpEmbedHosts`): postMessage protocol v1 in `docs/erp-embed.md`. It identifies the document
    by file name only, so two open documents with the same name are ambiguous.
  - `crash-guard.js`: a wasm trap / OOM / eframe panic ("panicked at" on `console.error`) shows a
    blocking "reload" dialog with the last draft time; embedded, it also posts `crashed`.
  - `sw.js`: network-first for pages, cache-first for assets, keeps old-build files while a tab
    of that build is open. It also answers the manifest's Android `share_target` (POST `/share-target/`):
    the shared file joins the same `pending` queue as the landing picker, then a 303 to `/<editor>/?open=<id>`.
- Editors open in a new tab from the shell nav: navigating away would drop the unsaved document.
- Links between exported pages are plain `<a>` (static hosting, no RSC rewrites).

## Conventions

- UI copy is Vietnamese. The editors default to Vietnamese too; the choice is shared across
  editors in `localStorage` `erpcons-ui-language` (each fork's `language.rs`). Terms follow
  `docs/glossary-vi.md` (Office VN feature names, clean-room sentences).
- `docs/gap-register.md` tracks what is still missing against the FULL V4 spec, by wave.
- Production is Apache 2.4 (`/etc/apache2/office.erpcons.vn.inc`: compression, MIME, cache).
  Deploy and rollback are WSL scripts outside the repo: `~/deploy-office.sh` (rsync a release
  dir, switch the `current` symlink, keep 3) and `~/rollback-office.sh [RELEASE|--list]`.
- Fork changes belong in the fork on branch `tuananhfr` and are recorded in its
  `ERPCONS-CHANGES.md`. The forks' own notes say "push to `main`" — that is upstream's flow;
  here `main` is untouched upstream. `../../craftrules` referenced by the forks is not checked out.
- Never reintroduce ArtCraft names/logos/links (brand terms); the build gate enforces it.
- Design spec and history: `docs/superpowers/specs/` and `docs/superpowers/plans/`.
  UI QA screenshots/reports go to `.qa/` (gitignored).
