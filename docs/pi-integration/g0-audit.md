# G0 audit: ERPCons Office against PI Holding V3

- Date: 2026-10-24
- Scope: ERPCons Office client side only: the four editors (Văn bản `wordcraft`, Bảng tính `gridcraft`,
  Trình chiếu `deckcraft`, PDF `pdfcraft`), each as a native desktop app and a wasm web app, the site and shell
  `erpcons-office`, and the shared updater `erpcons-update`. The PI Platform server (PI ID, Organization, Device,
  Entitlement, Consent, Release Registry, Quality) is out of scope and not built yet. `cadcraft` and
  `gridcraft-etabs` are excluded.
- Spec: PI Holding V3, HS01, HS02, HS03, HS05, HS06 (Vietnamese text extracted from the 7 docx files). Line
  references such as "HS02 L100" point at that extract. The spec is treated as target requirements, not as a
  description of what exists.
- Method: static reading of source, workflows and docs at the current heads (all four forks: `wip/desktop` =
  `tuananhfr` = `origin/tuananhfr`: wordcraft `2318554`, gridcraft `8a54d45`, deckcraft `30e651b`, pdfcraft
  `1dbcb356`; erpcons-update `16d7470` (tag `v0.1.0`); erpcons-office `d4153e0`), `grep` over `Cargo.lock`,
  read-only `curl` against `https://office.erpcons.ai` and the public GitHub release downloads (2026-10-24), and
  the existing local gate logs in `erpcons-office/build/logs/`. No cargo build or test was run for this audit.
  "Absent" means the stated search found nothing; the search is named in the evidence column.
- Status legend: **Verified** (exists, with evidence) · **Partial** · **Absent** · **Unknown** (could not determine).
  "Verified (vacuous)" marks a constraint that holds only because the feature it restricts does not exist yet; it
  must be preserved when that feature is built.
- HS01-V3 class legend: **Existing** (meets the requirement as is) · **Reuse** (code or pattern to build on) ·
  **Upgrade** (exists, needs change) · **Build** (new work) · **Retire** (to remove).
- Paths are relative to the workspace root `erpcons-workspace/`.

## 1. Product inventory (HS01 "Audit hiện trạng", HS01-V3-03)

Owner is Unknown for every row: no owner is recorded in any repo, CLAUDE.md or ERPCONS-CHANGES.md. API, AI and
cost (HS01 L22) are "none" for all rows: no server API is called except the update download, and no AI provider
code was found (grep `api_key|openai|anthropic|llm|ollama` over forks' `crates` and `apps`).

| Product / build | Repo, branch | Stack | Runtime | Version | Auth | Storage | Offline | Update mechanism | Telemetry | SBOM | Signing | Tests |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Văn bản desktop | `wordcraft`, `tuananhfr` @ `2318554` | Rust 2024 (`rust-version 1.90`), egui/eframe, `apps/wordcraft` | Native Win x64 (MSI, portable zip), Linux x86_64 (AppImage, deb, rpm), macOS universal DMG | 0.6.5 (`wordcraft/Cargo.toml:7`); published manifest 0.6.5, released 2026-10-22, no macOS asset (curl `releases/latest/download/update.json`) | None | Local files; settings, `update-state.json`, logs, recovery drafts under `%APPDATA%\ERPCons\VanBan` (`wordcraft/crates/control-key/src/lib.rs:7-18`, `wordcraft/apps/wordcraft/src/drafts.rs`) | Full (only runtime network is the updater) | `erpcons-update` v0.1.0 (`wordcraft/apps/wordcraft/Cargo.toml:72`), adapter `apps/wordcraft/src/updates.rs` | None | CycloneDX per release (`wordcraft/.github/workflows/erpcons-desktop.yml:134-137`) | Ed25519 update manifest only; Windows unsigned, macOS ad-hoc, not notarized (`erpcons-desktop.yml:262`) | Local gate 2026-10-24 @ `2318554`: `cargo test --workspace` passed=2377 failed=0 (`erpcons-office/build/logs/gate-ws-wordcraft-console.log`) |
| Văn bản web | `wordcraft` `apps/wordcraft-web` | Rust → wasm32 via trunk, wasm-bindgen 0.2.129 | Browser, WebGPU or WebGL2 (`erpcons-office/editor-shell/shell.js:2-12`), `office.erpcons.ai/van-ban/` | 0.6.5 (workspace version); production built from `f7e11ae5` (curl `/build-info.json`) | None | Memory; IndexedDB `erpcons-drafts-v1` (`erpcons-office/editor-shell/drafts.js:242`); localStorage `erpcons-ui-language` (`wordcraft/apps/wordcraft-web/src/web/language.rs:5`) | After one online visit per editor, via service worker (`erpcons-office/editor-shell/sw.js:44`) | Service worker build swap, user-confirmed "Cập nhật" (`editor-shell/shell.js:36-79`, `sw.js:134`) | None | Fork web SBOM generated locally only, `sbom/` gitignored (`erpcons-office/CLAUDE.md:25`) | HTTPS only; provenance hashes in `/build-info.json` | Included in the desktop gate run (host target); 25 `#[test]` in `apps/wordcraft-web` (static grep); wasm-only paths: Unknown |
| Bảng tính desktop | `gridcraft`, `tuananhfr` @ `8a54d45` | Rust, egui/eframe, `apps/gridcraft` | Same platforms as above | 0.6.5 (`gridcraft/Cargo.toml:7`); published 0.6.5, no macOS asset | None | `ERPCons/BangTinh` settings dir (`gridcraft/apps/gridcraft/src/main.rs:101`) | Full | `erpcons-update` v0.1.0 (`gridcraft/apps/gridcraft/Cargo.toml:28`) | None | CycloneDX (`gridcraft/.github/workflows/erpcons-desktop.yml:154-157`) | Manifest only; Windows unsigned, macOS ad-hoc (`erpcons-desktop.yml:289`) | Local gate 2026-10-24 @ `8a54d45`: passed=2209 failed=0 (`gate-ws-gridcraft-console.log`) |
| Bảng tính web | `gridcraft` `apps/gridcraft-web` | Rust → wasm32 | Browser, `/bang-tinh/` | 0.6.5; production built from `3eb0e5b4` | None | IndexedDB drafts, localStorage language (`gridcraft/apps/gridcraft-web/src/language.rs:7`) | As Văn bản web | As Văn bản web | None | Local only | HTTPS only | 12 `#[test]` in `apps/gridcraft-web` (static) |
| Trình chiếu desktop | `deckcraft`, `tuananhfr` @ `30e651b` | Rust, egui/eframe, `apps/deckcraft` | Same platforms | 0.6.5 (`deckcraft/Cargo.toml:7`); published 0.6.5 with macOS asset | None | `ERPCons/TrinhChieu`, recovery under `ERPCons/TrinhChieu/recovery` (`deckcraft/apps/deckcraft/src/main.rs:65-83`) | Full | `erpcons-update` v0.1.0 (`deckcraft/apps/deckcraft/Cargo.toml:14`) | None | CycloneDX (`deckcraft/.github/workflows/erpcons-desktop.yml:147-150`) | Manifest only; Windows unsigned, macOS ad-hoc (`erpcons-desktop.yml:267`) | Local gate 2026-10-24 @ `30e651b`: passed=1228 failed=0 (`gate-ws-deckcraft-console.log`) |
| Trình chiếu web | `deckcraft` `apps/deckcraft-web` | Rust → wasm32 | Browser, `/trinh-chieu/` | 0.6.5; production built from `30e651ba` | None | IndexedDB drafts, localStorage language (`deckcraft/apps/deckcraft-web/src/language.rs:7`) | As above | As above | None | Local only | HTTPS only | 16 `#[test]` in `apps/deckcraft-web` (static) |
| PDF desktop | `pdfcraft`, `tuananhfr` @ `1dbcb356` | Rust, egui/eframe, `apps/pdfcraft` | Same platforms | 0.7.7 (`pdfcraft/Cargo.toml:8`); published 0.7.7 with macOS asset | None | Settings dir (`pdfcraft/apps/pdfcraft/src/main.rs:71`) | Full | `erpcons-update` v0.1.0 (`pdfcraft/apps/pdfcraft/Cargo.toml:13`) | None; UI says "No telemetry, no account" (`pdfcraft/crates/ui-egui/src/home.rs:189`) | CycloneDX, listed in SHA256SUMS (`pdfcraft/.github/workflows/erpcons-desktop.yml:136-139`, `:244-246`) | Manifest only; Windows unsigned, macOS ad-hoc (`erpcons-desktop.yml:254`) | Latest gate log is @ `bf9fb577`, not HEAD: passed=3317 failed=1 (`assets::tests::the_real_manifest_passes`, `gate-ws2-pdfcraft-console.log`); at HEAD: Unknown |
| PDF web | `pdfcraft` `apps/pdfcraft-web` | Rust → wasm32 | Browser, `/pdf/`; also `?file=<url>` fetch (`pdfcraft/apps/pdfcraft-web/src/main.rs:54-60`, `:348-351`) | 0.7.7; production built from `249e938f` | None | IndexedDB drafts, localStorage language (`pdfcraft/apps/pdfcraft-web/src/language.rs:7`) | As above | As above | None | Local only | HTTPS only | 5 `#[test]` in `apps/pdfcraft-web` (static) |
| Supporting: site and shell | `erpcons-office`, `tuananhfr` @ `d4153e0` | Next 16.3.8 static export, React 19.2.8, plain ES5 shell scripts | Apache 2.4 at 69.62.73.66 (`erpcons-office/CLAUDE.md:92`, `:120`) | No version field; production site SHA `b9188e41` (curl `/build-info.json`) | None; landing promises "Không cần tài khoản" (`src/content/landing.ts:7`) | No backend | Service worker | Web: SW; desktop suite: `packaging/suite`, `.github/workflows/desktop-suite.yml` | None | npm SBOM deployed at `/sbom.cdx.json` (curl 200, `scripts/assemble.mts:28`); suite `sbom.cdx.json` (`packaging/suite/release.py:34`) | Suite setup.exe signed only when `ERPCONS_REQUIRE_SIGNING=true` (`desktop-suite.yml:69-82`) | 280 vitest cases (static grep of `it(`/`test(`), 7 suite Python tests |
| Supporting: updater | `erpcons-update`, `main` @ `16d7470`, tag `v0.1.0` | Rust, ureq 3 + rustls with OS roots, ed25519-dalek, sha2 | Linked into the 4 desktop apps | 0.1.0 | None | `update-state.json` + `updates/` cache next to it (`erpcons-update/README.md:8-9`) | n/a | n/a | None | Via forks' SBOM | n/a | 11 `#[test]` in `src/` + `tools/test_make_manifest.py` (static) |

Test counts marked "static" are `#[test]`/`it(` annotation counts, not run results. Gate counts are from local
Docker gate logs (`build/run.sh gate`), not from CI.

## 2. Requirements

| ID | Requirement (spec ref) | Status | Class | Evidence | Note |
|---|---|---|---|---|---|
| HS01-INV-01 | Inventory per product: repo, owner, stack, API, auth, storage, AI, tests, version, offline, backup, vulnerabilities, cost (HS01 L22, HS01-V3-03 L58) | Partial | Build | Section 1 of this file | Owner, backup, vulnerabilities and cost not recorded anywhere. |
| HS01-INV-02 | Product registry with `product_id` (HS01 V2 L28) | Absent | Build | Three unrelated identifier schemes: web slug `van-ban` (`erpcons-office/src/config/editors.ts:27-48`), updater `app_id` `vanban` (`wordcraft/apps/wordcraft/src/updates.rs:31`), bundle id `vn.erpcons.vanban` (`wordcraft/packaging/macos/Info.plist.in:16`) | A PI `product_id` needs a mapping to all three, per build (desktop and web). |
| HS01-INV-03 | Office is Local-first on PC and Web (HS01 L14, V2 L26) | Verified | Existing | Only runtime HTTP client in the desktop apps is `erpcons-update` (Cargo.lock reverse deps of `ureq`; pdfcraft's `reqwest` is a winprint build dependency, `pdfcraft/deny.toml:65-68`); web offline via SW (`erpcons-office/editor-shell/sw.js:62-87`) | Web works offline only for editors opened online once on that device. |
| HS01-INV-04 | Audit distribution licence and trademark before distribution; do not assume the right to lock OSS components (HS01 L14, HS02 L106, HS02-V3-05 L173) | Partial | Upgrade | `LICENSE-MIT`, `LICENSE-APACHE`, `NOTICE`, `ATTRIBUTION.md` in each fork; ArtCraft mark guard `erpcons-office/src/lib/build/fork-guard.ts:19-22`; `deny.toml` exists but `cargo deny` runs only in upstream CI on `main` (`pdfcraft/.github/workflows/ci.yml:113-118`); no `cargo deny` in any `erpcons-ci.yml` (grep) | No trademark review of "ERPCons Văn phòng"/"Office" naming found. Gating features of MIT/Apache code is legally possible but enforceable only server side (see risks). |
| HS01-INV-05 | Per product: channel PC/Web/PWA/Mobile, offline, Local/NAS/Cloud storage, quota, PI ID policy (HS01-V3-04 L70) | Partial | Build | Channels/offline/storage in section 1; PWA manifest `erpcons-office/src/lib/pwa/web-manifest.ts:28` | Quota and PI ID policy undefined; no NAS/Cloud storage. |
| HS01-INV-06 | Known vulnerabilities per product (HS01 L22) | Unknown | Build | `cargo deny check` / `npm audit` not run in this audit (read-only, no builds) | Run in G1. |
| HS02-ID-01 | First run activates PI ID with OIDC Authorization Code + PKCE in the system browser (HS02 L92, V2 L119) | Absent | Build | grep `pkce\|oidc\|oauth\|openid\|access_token\|refresh_token\|bearer` over each fork's `crates/ui-egui/src` and `apps`: no hits; no OIDC/OAuth crate in any `Cargo.lock` | Reuse: system browser via `ctx.open_url` (`wordcraft/crates/ui-egui/src/updates.rs:78-82`), `webbrowser`/`open` already in lockfiles; loopback listener pattern `wordcraft/apps/wordcraft/src/control_server.rs:40`. No custom URI scheme is registered (grep `URL Protocol\|x-scheme-handler\|CFBundleURLTypes` in `packaging/`). |
| HS02-ID-02 | Tokens in the OS credential store (HS02 V2 L119) | Absent | Build | No `keyring`, Windows Credential Manager or Secret Service crate in any fork `Cargo.lock` | Precedent for OS key stores (signing identities, not tokens): pdfcraft reads the macOS keychain (`pdfcraft/crates/sign/src/keychain.rs:8-10`) and the Windows certificate store (`pdfcraft/crates/sign/src/windows.rs`). Elsewhere `security-framework` comes in only through `rustls-native-certs`. |
| HS02-ID-03 | PI ID sign-in on the web editors | Absent | Build | Site copy: "Không cần tài khoản … không đăng ký, không đăng nhập" (`erpcons-office/src/content/landing.ts:7`), "miễn phí và không cần tài khoản" (`:34`) | Product decision needed before any web sign-in. |
| HS02-ID-04 | No passwords or signing keys stored in the app (HS02 L102) | Verified | Existing | Client holds only the Ed25519 public key (`erpcons-update/src/lib.rs:22-25`); private key is CI secret `ERPCONS_UPDATE_KEY` (`wordcraft/.github/workflows/erpcons-desktop.yml:235-244`) | Same rule must apply to lease verification keys. |
| HS02-ORG-01 | Org and membership awareness: one PI ID in several orgs, roles, `org_context` (HS02 L94-95, HS05 L406) | Absent | Build | No org/tenant concept in forks, updater or site (grep `org_id\|tenant\|membership` over `crates/ui-egui/src`, `apps`, `erpcons-office/src`, `editor-shell`, `erpcons-update/src`: only French "maintenant" in gridcraft catalogs) | Client needs an org switcher and per-org entitlements. |
| HS02-DEV-01 | Device registry fields `device_id`, `installation_id`, `product_id`, `version`, `last_seen` (HS02 L98) | Absent | Build | grep `installation_?id\|machine_?id\|device_?id` in `apps/*` and `erpcons-update/src`: only PCI device ids for GPU selection (`pdfcraft/apps/pdfcraft/src/main.rs:650-661`) | Natural home for `installation_id`: each app's settings dir (section 4). |
| HS02-DEV-02 | `POST /v1/devices/activate` with device public key / signed challenge, 401/403/409/429 (HS02 L109, L115) | Absent | Build | No client for any PI endpoint | `ed25519-dalek` is already a dependency of `erpcons-update` and can generate a device key. |
| HS02-ENT-01 | Entitlements: product, feature, scope, quota, seats, validity, `offline_allowed`, `policy_version`; `GET /v1/me/entitlements`; enforced server side (HS02 L99, L110, HS02-V3-03 L149) | Absent | Build | No feature gating in any fork (grep `entitlement\|licen[cs]e_?key\|activation`: unrelated hits only) | |
| HS02-LIC-01 | Offline licence signed asymmetrically (subject, device binding, features, nonce, `issued_at`, `expires_at`); client keeps the public key only (HS02 L100, HS02-V3-04 L161) | Absent | Build | No lease code | Reuse: `verify_strict` over exact bytes before parsing (`erpcons-update/src/lib.rs:208`, `:283-287`). |
| HS02-LIC-02 | 30 days default, 90 for sites, warnings at 7/3/1 days; after expiry the user can still view and export (HS02 L101, L161) | Absent | Build | No lease code | Nothing is gated today, so view/export always work; gating must exempt open, save, export and backup. |
| HS02-LIC-03 | Detect clock rollback (HS02 L112) | Absent | Build | Only wall-clock use is the update throttle: `now.saturating_sub(last_check) < 86400` (`erpcons-update/src/lib.rs:148-159`, `:381-385`) | After a backwards clock jump the throttle reports `NotDue` until the clock passes the last check; no monotonic or rollback detection exists. |
| HS02-LIC-04 | Revocation synced when online; offline revocation not immediate (HS02 L102) | Absent | Build | No lease or revocation code | |
| HS02-CON-01 | Independent consents: terms, privacy notice, optional analytics, optional marketing; withdrawal and audit; `POST /v1/consents` (HS02 L96, L111, HS02-V3-05 L173) | Absent | Build | grep `consent\|cookie\|privacy\|quyền riêng tư\|điều khoản` in `erpcons-office/src`, `app`, `editor-shell`: no consent UI; site has no privacy or terms page (`erpcons-office/app/`: `huong-dan`, `kham-pha` only) | |
| HS02-DP-01 | No collection of document content, local paths or personalised behaviour without basis (HS02 V2 L119, HS03 L197, L224, HS06-V3-05 L567) | Verified (vacuous) | Existing | No telemetry (see HS03-TEL-01); the updater sends only a GET with `User-Agent: ERPCons-VanBan/<version>` (`erpcons-update/src/lib.rs:454-457`, `wordcraft/apps/wordcraft/src/updates.rs:36`); web crash signal posts `{}` (`erpcons-office/editor-shell/crash-guard.js:99`) | Local logs contain paths (`wordcraft/apps/wordcraft/src/main.rs:181`, `:201`); never upload raw logs. The embed bridge sends file names to the ERP host by design (`docs/erp-embed.md`). |
| HS02-REL-01 | Windows installer and executables Authenticode-signed (HS02 L104, HS02-V3-05 L173, HS03 L214) | Absent | Upgrade | Release notes: "Windows không được ký" (`wordcraft/.github/workflows/erpcons-desktop.yml:262`, gridcraft `:289`, deckcraft `:267`, pdfcraft `:254`); the only secret the four workflows read is `ERPCONS_UPDATE_KEY` (grep `secrets.`) | Tooling exists: `packaging/windows/sign.ps1` (signtool, PFX or Azure Trusted Signing, skips with a warning, `wordcraft/packaging/windows/sign.ps1:6-12`) called from `package.ps1:94`. Suite gate signs only the outer `setup.exe` (`erpcons-office/.github/workflows/desktop-suite.yml:69-82`). |
| HS02-REL-02 | macOS Developer ID signing and notarization | Absent | Upgrade | Workflow step "Package ad-hoc signed macOS installer" (`wordcraft/.github/workflows/erpcons-desktop.yml:179`); suite refuses macOS when signing is required (`desktop-suite.yml:110-113`) | `packaging/macos/package.sh:10-14`, `:48-52` already supports identity + notarization; secrets not wired. |
| HS02-REL-03 | Linux packages signed (deb/rpm/AppImage) | Absent | Build | No `gpg`/`rpmsign`/`debsigs` in `erpcons-desktop.yml` (grep) | SHA256SUMS and the signed manifest cover integrity for self-update only. |
| HS02-REL-04 | Signed update manifest | Verified | Existing | Ed25519 signature fetched and verified before JSON parsing (`erpcons-update/src/lib.rs:195-210`, `:283-287`); signed in CI with `openssl pkeyutl -sign -rawin` (`wordcraft/.github/workflows/erpcons-desktop.yml:244`) | Single embedded key, no rotation path (risk 5). |
| HS02-REL-05 | SHA-256 manifest (HS02 L104) | Verified | Existing | Per-asset `sha256` + `size` in `update.json` (`erpcons-update/README.md:13-21`), verified before rename and rechecked by the helper (`README.md:61-66`); `SHA256SUMS.txt` per release (`wordcraft/.github/workflows/erpcons-desktop.yml:253`); suite checksums (`erpcons-office/packaging/suite/release.py:39-43`) | Published manifests fetched 2026-10-24 contain sha256 per asset. |
| HS02-REL-06 | SBOM for desktop releases (HS02 L104, HS03 L214) | Verified | Existing | "Generate desktop SBOM" step in all four `erpcons-desktop.yml` (wordcraft `:134-137`, gridcraft `:154-157`, deckcraft `:147-150`, pdfcraft `:136-139`) | CycloneDX 1.5 from Cargo metadata (`wordcraft/ERPCONS-CHANGES.md`). |
| HS02-REL-07 | SBOM for the web build | Partial | Upgrade | Site npm SBOM deployed (`/sbom.cdx.json` 200; `erpcons-office/scripts/assemble.mts:28`); fork wasm SBOMs only local, gitignored, never deployed (`erpcons-office/CLAUDE.md:25`) | |
| HS02-REL-08 | Provenance (HS02 L104) | Partial | Upgrade | Web: `build-provenance.json` per fork and `/build-info.json` with SHAs, dirty flag, tool versions, artifact hashes (`erpcons-office/src/lib/build/provenance.ts:42-61`; live file checked with curl). Desktop: no attestation step (grep `attest` in all workflows: none) | |
| HS02-REL-09 | Channels stable / canary / beta (HS02 L104) | Absent | Build | Updater reads `releases/latest/download/update.json` only (`erpcons-update/src/lib.rs:195`); releases are created with `--latest` (`wordcraft/.github/workflows/erpcons-desktop.yml:276`) | Web has a single production deployment. |
| HS02-REL-10 | Atomic update and rollback (HS02 L104, HS02-V3-05 L173) | Partial | Upgrade | Portable and macOS: stage then swap, restoring the old copy if the swap fails (`erpcons-update/src/helper.rs:271-282`); AppImage stage + rename; MSI delegated to `msiexec /i … /passive /norestart` (`helper.rs:290-297`); failure recorded and old app relaunched (`helper.rs:713-745`, test) | No post-launch health check, no rollback to the previous version after a bad but installable release. Web rollback is by symlink, but the deploy/rollback scripts are lost (`erpcons-office/CLAUDE.md:94-95`, `:119-120`). |
| HS02-REL-11 | Staged rollout (HS02-V3-05 L173, HS06 L503 "5%") | Absent | Build | Manifest schema has no cohort/percentage field (`erpcons-update/README.md:13-21`); every client reads the same latest manifest | Needs a new `erpcons-update` tag and a bump in all four forks. |
| HS02-REL-12 | PI installer downloadable publicly (HS02 L92) | Partial | Upgrade | Releases download without auth (curl 200 on all four `update.json`); site entry points hidden: `DESKTOP_DOWNLOADS_ENABLED = false` (`erpcons-office/src/config/desktop.ts:3`, commit `396c7d8`) | Reason for hiding ("open problem") is not documented. |
| HS02-BR-01 | Branding only through checked logo images and design tokens, no HTML/JS; org name, logo, accent; preview and rollback (HS02 L105, HS06 L507, HS06-V3-02 L531) | Partial | Upgrade | Compiled token structs: `wordcraft/crates/ui-egui/src/theme.rs:234`, `gridcraft/…/theme.rs:17`, `deckcraft/…/theme.rs:16`, `pdfcraft/…/theme.rs:42`; site CSS tokens `erpcons-office/src/styles/tokens.css:1-27`; product names are constants (`wordcraft/apps/wordcraft/src/main.rs:28`) | No runtime theme or org branding input, no schema allowlist, preview or rollback. |
| HS02-BR-02 | No ads while editing Office/CAD (HS02 L105, HS06 L509, HS06-V3-03 L543) | Verified (vacuous) | Existing | grep `advert\|campaign\|quảng cáo\|promo` in the four `crates/ui-egui/src`, `editor-shell`, `src`: only Word outline "Promote" commands | |
| HS02-BR-03 | Promotional payloads with TTL, frequency cap, audit and consent (HS02 L105) | Absent | Build | No promotional content path | Existing service notices: SW update notice (`erpcons-office/editor-shell/shell.js:59-79`) and desktop update dialog. |
| HS03-TEL-01 | Client telemetry (SDK/OpenTelemetry) with envelope `event_id, event_type, schema_version, occurred_at, product_id, tenant_ref, device_ref, trace_id, release_id, severity, attributes` (HS03 L195-196, L224) | Absent | Build | grep `telemetry\|opentelemetry\|sentry\|analytics\|gtag\|plausible\|posthog\|matomo` over forks, updater and site: only unrelated text hits | pdfcraft tells users "No telemetry" (`pdfcraft/crates/ui-egui/src/home.rs:189`). |
| HS03-TEL-02 | Desktop offline ring buffer, batched send with retry and idempotency (HS03 L197, OPS02 L217) | Absent | Build | No buffer or sender | Local log rotation (`wordcraft/apps/wordcraft/src/logging.rs:1-21`) is not a telemetry buffer. |
| HS03-TEL-03 | Crash signal for `app.crashed` and crash-free KPI (HS03 L200, HS05 L407) | Partial | Upgrade | Desktop panic hook logs locally (`wordcraft/apps/wordcraft/src/logging.rs:325`; `install()` in gridcraft `logging.rs:280`, deckcraft `:279`, pdfcraft `:249`); web `crash-guard.js` detects wasm traps/panics (`editor-shell/crash-guard.js:12`, `:118-121`) and posts `crashed` only to an embedding host (`:99`) | Nothing leaves the device. |
| HS03-TEL-04 | Update success KPI = verified installs / attempts (HS03 V2 L220) | Partial | Upgrade | `PreviousResult::Installed/Failed` saved by the helper (`erpcons-update/src/helper.rs:214-224`) and shown once in the UI (`wordcraft/crates/ui-egui/src/updates.rs:127-145`) | Not reported anywhere. |
| HS03-GATE-01 | Release gate: signed artifact, SBOM, migration/rollback, contract tests, P0=P1=0, UAT (HS03 L214, HS03-V3-05 L278) | Partial | Upgrade | `erpcons-desktop.yml` jobs are windows/linux/macos/release with no test step and no dependency on `erpcons-ci.yml` (grep `cargo test\|xtask` in `wordcraft/.github/workflows/erpcons-desktop.yml`: none); local gate `erpcons-office/build/gate.sh:41-48` exists but is not tied to tagging | SBOM and signed manifest are present; Authenticode, contract tests, UAT evidence are not. |
| HS03-GATE-02 | Unsigned update cannot ship (HS03-V3-03 L254, HS05 L412) | Verified | Existing | Client rejects manifests whose signature fails (`Error::BadSignature`, `erpcons-update/src/lib.rs:283-287`) and assets whose hash fails (`HashMismatch`) | Covers the self-update channel only, not first install. |
| HS03-GATE-03 | P0/P1 = 0 or approved exception (HS03 L214, HS01 DoD L84) | Unknown | Upgrade | Previous audit listed 5 P0 (`erpcons-office/docs/audit/2026-10-master-v2-g0.md`, 2026-10-21); at least WORD-01 (altChunk) has a later fix entry in `wordcraft/ERPCONS-CHANGES.md`; current state of the others not re-verified | |
| HS05-CTR-01 | JWT/OIDC claims `iss, aud, sub, org_context, scopes, exp` (HS05 L406) | Absent | Build | No token handling in client code (see HS02-ID-01) | |
| HS05-CTR-02 | Events `device.activated`, `app.crashed`, `consent.changed`, … at-least-once, idempotent, versioned (HS05 L407, HS05-V3-01 L427) | Absent | Build | No event emitter | |
| HS05-CTR-03 | Standard HTTP errors 400/401/403/409/412/422/429/503 (HS05 L408, HS02 V2 L115) | Partial | Upgrade | `erpcons-update` turns any non-2xx into `Error::Http(u16)` (`erpcons-update/src/lib.rs:459-462`) with `http_status_as_error(false)` (`:440`); adapters show one generic translated message (`wordcraft/apps/wordcraft/src/updates.rs:122`) | No per-status handling, no `Retry-After`, no 401 re-auth. Reusable: OS trust roots + 15 s timeouts (`lib.rs:426-447`). |
| HS05-CTR-04 | Shared IDs `user_id, org_id, tenant_id, device_id, installation_id, product_id, release_id, trace_id` (HS05 L419) | Partial | Upgrade | Release identity: tag `erpcons-v<version>` enforced (`wordcraft/.github/workflows/erpcons-desktop.yml:31-39`), site SHA in `/build-info.json`; product ids per HS01-INV-02 | No user, org, tenant, device, installation or trace id. |
| HS05-CTR-05 | `correlation_id` / `trace_id` on requests and logs (HS01-V3 L39, HS02-V3-03 L149, HS05-V3-01 L427) | Absent | Build | grep `correlation_id\|trace_id` over forks, updater, site: none | |
| HS05-CTR-06 | `Idempotency-Key` on mutating calls (HS02 L108, L149, HS05 L419) | Absent | Build | Client issues GETs only (`erpcons-update/src/lib.rs:454-457`) | |
| HS05-CTR-07 | OpenAPI 3.1, JSON Schema, mock server, consumer contract tests (HS05 L409, HS05-V3-01 L427) | Absent | Build | grep `openapi` in `erpcons-office/docs`, `src`, `erpcons-update`: none | Client contract tests depend on the PI mock (Team A). |
| HS06-CNT-01 | Signed client content manifest (JSON, asset hash, TTL); expired content hidden; no executable code from banners (HS06 L505, HS06-V3-03 L543) | Absent | Build | No content channel | Reuse the updater's pattern: signature over exact bytes, size caps, URL allowlist, per-asset sha256 (`erpcons-update/src/lib.rs:283-320`, `README.md:13-21`). |
| HS06-CNT-02 | Binary updates use a separate signed channel from content (HS06 L505) | Verified | Existing | Updates have their own manifest, key and code path (`erpcons-update`) | Keep content out of `update.json`. |
| HS06-CNT-03 | Service notices separate from marketing; withdrawing consent stops marketing (HS06 L505, HS06-V3-05 L567) | Absent | Build | No marketing content; no consent state (HS02-CON-01) | |
| HS06-CNT-04 | Security warnings, permission UX and legal notices cannot be changed by themes or orgs (HS06 L507, HS06-V3-04 L555) | Verified (vacuous) | Existing | About/credits text is compiled in and guarded at build (`erpcons-office/src/lib/build/fork-guard.ts:19-22`); no runtime customisation path exists | |
| HS06-CNT-05 | Engagement reporting (impressions, click, dismiss) under consent, without file content or names (HS06-V3-05 L567) | Absent | Build | No engagement events | |
| WEB-01 | Embedded mode `?embed=erpcons` takes identity/entitlement from the ERP host instead of running its own sign-in (derived: HS02 L92 + HS06 L497) | Absent | Build | Bridge activates on `embed=erpcons` + allow-listed `parent` (`erpcons-office/editor-shell/host-bridge.js:7-10`), accepts messages only from that origin and window (`:182`); protocol v1 carries files and save events only (`docs/erp-embed.md`); drafts off when embedded (`editor-shell/drafts.js:7`) | Separate `?host=parent` mode in pdfcraft web (`pdfcraft/apps/pdfcraft-web/src/main.rs:82-108`). |
| WEB-02 | CSP with `connect-src` for the IdP and PI API, `frame-ancestors` for the ERP embed (derived: HS02 L92, `docs/erp-embed.md:106`) | Absent | Build | `curl -sI https://office.erpcons.ai/bang-tinh/` and `/` on 2026-10-24: no `Content-Security-Policy`, `X-Frame-Options` or `Strict-Transport-Security`; no header config in the repo (Apache include lives on the server, `erpcons-office/CLAUDE.md:92`) | A CSP must allow the inline install-prompt script (`erpcons-office/app/layout.tsx:33`) and the inline shell script (`src/lib/editor-shell/assets.ts:13-15`) by hash (static export, no nonces), plus `'wasm-unsafe-eval'`; pdfcraft `?file=` fetch is limited by `connect-src`. `frame-ancestors` is documented but not deployed, so any site can frame the editors today. |
| WEB-03 | An OIDC callback page is never cached or served from cache (derived) | Absent | Upgrade | Same-origin GET navigations are network-first (`erpcons-office/editor-shell/sw.js:5-9`) and stored under the full URL including the query (`sw.js:66-68`); offline fallback matches with `ignoreSearch` (`sw.js:78`); cross-origin IdP requests bypass the worker (`sw.js:6`) | As written, `?code=…&state=…` would persist in Cache Storage. Add a bypass path the way `/share-target/` is special-cased (`sw.js:155`, `:210-213`). |

Totals: Verified 10 (3 of them vacuous) · Partial 13 · Absent 32 · Unknown 2 · 57 rows.
Class: Existing 10 · Upgrade 15 · Build 32 · Reuse 0 as a row class (reuse candidates are named in the notes and in
section 3) · Retire 0.

## 3. Integration points

### Desktop, per fork

- **Hook trait pattern.** Native-only trait in `crates/ui-egui/src/updates.rs`, module gated by
  `#[cfg(not(target_arch = "wasm32"))]` (`wordcraft/crates/ui-egui/src/updates.rs:6-7`):
  `UpdateHook` at wordcraft `:41-49`, gridcraft `:36`, deckcraft `:40`, pdfcraft `:61`. Blocking calls run on a
  worker thread with an mpsc channel and `request_repaint` (`wordcraft/crates/ui-egui/src/updates.rs:89-124`), and
  `poll_updates` drains results each frame (`:126-165`). A PI account/licence hook (sign in, sign out, status,
  entitlements, lease refresh) fits the same shape: trait in `ui-egui`, adapter in `apps/<name>/src/`, network
  code in a shared native crate pinned by tag like `erpcons-update`.
- **Adapters.** `apps/<name>/src/updates.rs`: `DesktopUpdates::new` at wordcraft `:29-40`, gridcraft `:30`,
  deckcraft `:30`, pdfcraft `:29`; `impl UpdateHook` at wordcraft/pdfcraft `:50`, gridcraft `:55`, deckcraft `:51`.
  Typed errors are mapped to catalog keys (`wordcraft/apps/wordcraft/src/updates.rs:119-131`) with a test that
  every error is translated in en and vi (`:138-163`); PI errors (401/403/409/429/503) should follow this.
- **Injection is not uniform.** wordcraft: `Services.updates` (`wordcraft/crates/ui-egui/src/lib.rs:114-116`), set
  in `services()` (`wordcraft/apps/wordcraft/src/main.rs:212-218`). gridcraft: `SheetApp.update_hook`
  (`gridcraft/crates/ui-egui/src/lib.rs:311-313`), set at `gridcraft/apps/gridcraft/src/main.rs:414`. deckcraft:
  `SlideApp.update_hook` (`deckcraft/crates/ui-egui/src/lib.rs:249`, `:316`), set at
  `deckcraft/apps/deckcraft/src/main.rs:276`. pdfcraft: `PdfCraftApp.update_hook`
  (`pdfcraft/crates/ui-egui/src/lib.rs:492`, `:574`), set at `pdfcraft/apps/pdfcraft/src/main.rs:370`.
- **Process start.** `run_helper_from_args()` must stay first in `main` (`erpcons-update/README.md:4-6`); a
  first-run activation prompt belongs after window creation, next to the update auto-check in `poll_updates`.
- **State location.** One settings dir per app, holding `update-state.json`: wordcraft
  `crates/control-key/src/lib.rs:7-18` (`%APPDATA%\ERPCons\VanBan`), gridcraft `apps/gridcraft/src/main.rs:101`,
  deckcraft `apps/deckcraft/src/main.rs:65-72`, pdfcraft `apps/pdfcraft/src/main.rs:71`. A shared PI session or
  `installation_id` across the four apps needs a common location (for example `ERPCons/PI`) or one credential-store
  entry.
- **UI entry points.** Update command: wordcraft `ui.checkUpdates` (`crates/ui-egui/src/lib.rs:1303`), gridcraft
  `app.checkForUpdates` (`lib.rs:846`, ribbon `ribbon.rs:134`), deckcraft `help.check_updates` (`lib.rs:749`),
  pdfcraft `help.check_updates` (`commands.rs:648`). Account screen: deckcraft already has Backstage
  `Page::Account` (`deckcraft/crates/ui-egui/src/backstage.rs:39`, renderer `:1237-1239`, which says "DeckCraft
  has no accounts"); wordcraft Backstage pages list (`wordcraft/crates/ui-egui/src/backstage.rs:9-20`, Options and
  About only); gridcraft Backstage `Page::Options` (`gridcraft/crates/ui-egui/src/backstage.rs:38`, `:981`);
  pdfcraft has no Backstage: Home screen (`pdfcraft/crates/ui-egui/src/home.rs:21`, copy at `:189`) and About
  dialog (`pdfcraft/crates/ui-egui/src/dialogs.rs:1103`).
- **System browser and loopback.** `ctx.open_url` (`wordcraft/crates/ui-egui/src/updates.rs:78-82`); localhost
  listener pattern `wordcraft/apps/wordcraft/src/control_server.rs:36-43` (opt-in `--control`), usable as a model
  for an RFC 8252 loopback redirect.
- **i18n catalogs and coverage tests** (every new string needs entries):
  - wordcraft: `crates/ui-egui/src/i18n/*.tsv` (22 catalogs incl. `vi.tsv`); `i18n/tests.rs:205`
    `every_tab_and_command_is_translated`, `:266`/`:302` full-catalog coverage for uk/sr; pseudo-language scan
    `i18n/audit.rs`.
  - gridcraft: `crates/ui-egui/src/i18n/*.rs` + `messages.rs`; `i18n.rs:953`
    `vietnamese_covers_every_key_any_catalog_has`, `:979` no English product name in vi.
  - deckcraft: `crates/ui-egui/src/i18n/vi.tsv` only; `i18n/tests.rs:88` `every_tl_literal_is_translated` (scans
    all `tl!` literals), `:134`, `:150`.
  - pdfcraft: `crates/ui-egui/src/i18n/*.tsv` (23 catalogs); `i18n/mod.rs:3105`, `:3123`
    `vietnamese_covers_ui_literals`, and literal coverage for ja/it/pt-br (`:946`, `:976`, `:1107`), so new UI
    literals also need those languages.

### Web, per fork (`apps/<name>-web`)

- Entry: wordcraft `apps/wordcraft-web/src/web.rs:22`, gridcraft `src/web.rs:15`, deckcraft `src/web.rs:22`,
  pdfcraft `src/main.rs:30`.
- JS bridge pattern: the shell exposes a `window.erp*` object and wasm reads it with `js_sys::Reflect::get` at each
  use: `erpDrafts` (`deckcraft/apps/deckcraft-web/src/draft_bridge.rs:152-158`,
  `pdfcraft/apps/pdfcraft-web/src/main.rs:139-197`, `gridcraft/apps/gridcraft-web/src/drafts.rs`,
  `wordcraft/apps/wordcraft-web/src/web/drafts.rs`), `erpEditorClosed`
  (`wordcraft/apps/wordcraft-web/src/editor_closed.rs:15`), `erpEmbed`
  (`wordcraft/apps/wordcraft-web/src/web/drafts/embedded.rs:48`). A `window.erpAccount` (status, entitlements)
  provided by the shell keeps tokens out of wasm and works the same in all four editors.
- Shared language key `erpcons-ui-language` (`wordcraft/apps/wordcraft-web/src/web/language.rs:5`, others
  `language.rs:7`) shows the four editors already share same-origin storage.

### Site and shell (`erpcons-office`)

- Shell script order: `SHELL_SCRIPTS` (`src/lib/editor-shell/assets.ts:7`); build-time globals injected before them
  (`assets.ts:13`, `window.erpEmbedHosts` from `src/config/embed.ts:4`). An account script would be injected the same
  way with IdP config (issuer, client id) from `src/config/`, placed after `shell.js` and detecting embed mode as
  `drafts.js:7` does.
- Shell bar markup: `src/lib/editor-shell/inject.ts:94-103` (slot for sign-in state next to the update notice
  that `shell.js:59-79` appends).
- Landing header: `src/components/landing/SiteHeader.tsx:29-32` (header actions), `:33-36` (mobile menu); footer
  `SiteFooter.tsx:9` (source links); copy to revise `src/content/landing.ts:6-7`, `:34`.
- Service worker: `editor-shell/sw.js:5-9` `classify` (add a bypass for the callback path), special path handling
  `:155`, `:210-213`; registration scope `/` (`src/components/RegisterServiceWorker.tsx:11`,
  `src/lib/pwa/web-manifest.ts:28`).
- Headers: none in repo; local preview sets only `Cache-Control` (`scripts/preview.mts:29`), so CSP testing needs
  preview support.
- Desktop downloads switch: `src/config/desktop.ts:3`. Suite packaging: `packaging/suite/`,
  `.github/workflows/desktop-suite.yml`.

## 4. Risks and unknowns

1. **Public promises conflict with PI.** Landing says no account, no sign-in, free (`landing.ts:7`, `:34`);
   pdfcraft says "No telemetry, no account" (`home.rs:189`). Requiring PI ID or consent changes these promises;
   product and legal decision needed before G1.
2. **Client-side enforcement is advisory.** Forks are public (footer links to source, `SiteFooter.tsx:9`; release
   downloads need no auth) and MIT OR Apache-2.0, so any entitlement or lease check can be removed by rebuilding.
   Entitlement must be enforced on PI Cloud APIs (HS02 L110); offline leases only keep honest clients honest.
3. **Unsigned binaries.** Windows unsigned and macOS ad-hoc. Expected consequences (not tested here): SmartScreen /
   Smart App Control friction, and on macOS keychain items bound to an ad-hoc code signature that changes every
   release, which would break silent token reads after each update. Signing should precede credential-store work.
4. **Four apps, four state dirs.** Without a shared store each desktop app would sign in and activate separately;
   the spec's device registry (`device_id`, `installation_id`, `product_id`) needs a decision on whether a device
   is the machine, the suite or each app.
5. **Updater limits.** One hard-coded public key with no rotation (`lib.rs:22`), `latest` only, no channels or
   cohorts, and `released` is not checked for freshness (a stale signed manifest cannot downgrade but can hide a
   newer release). Any change needs a new `erpcons-update` tag and a bump in all four forks.
6. **Web security headers missing.** No CSP, HSTS or frame-ancestors on production; inline scripts need hashes.
   Adding an IdP widens `connect-src`/`form-action`; adding CSP may break pdfcraft `?file=` URLs.
7. **Service worker vs OIDC.** Callback URLs with `code`/`state` would be cached and could be served offline from
   cache (`sw.js:66-68`, `:78`).
8. **Embedded editors.** In the `lpc.vn` iframe, IdP pages usually refuse framing and third-party storage is
   partitioned, so identity must be brokered by the ERP host over postMessage; protocol v1 identifies documents by
   file name only (`erpcons-office/CLAUDE.md:73-75`).
9. **Clock and leases.** No monotonic or rollback-aware time source exists; the only wall-clock logic is the update
   throttle.
10. **Logs contain paths.** Desktop logs include filesystem paths; telemetry must be built from structured events,
    never by uploading logs.
11. **Release process gaps.** Desktop release workflows do not run tests; web deploy and rollback scripts are lost;
    production web lags HEAD for wordcraft (`f7e11ae5` vs `2318554`), gridcraft (`3eb0e5b4` vs `8a54d45`) and
    pdfcraft (`249e938f` vs `1dbcb356`).
12. **i18n cost.** pdfcraft literal coverage tests span several languages; wordcraft ships 22 catalogs. Every PI
    string multiplies across them.
13. **Unknown:** why desktop downloads were hidden (`396c7d8` says only "open problem").
14. **Unknown:** whether signing certificates or Apple credentials exist as repository secrets (secrets are not
    readable; workflows reference none).
15. **Unknown:** GitHub branch protection and required checks (`gh` is not installed on this machine).
16. **Unknown:** pdfcraft test status at HEAD `1dbcb356` (last gate log is at `bf9fb577` with one failure).
17. **Unknown:** purpose of the sibling repo `erpcons-account`: it exists in the workspace but has no commits
    (`git -C erpcons-account log` → "does not have any commits yet").
18. **Unknown:** product owners, backup policy, vulnerability status (no `cargo deny` / `npm audit` run), and the
    production Apache configuration (`/etc/apache2/office.erpcons.vn.inc` is outside the repo).
