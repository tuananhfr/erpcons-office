# ADR: An online tier for signed-in users

Status: Proposed (2026-10-27). Owner decisions of 2026-10-27: backend in Rust, own repo `erpcons-office-server`, Office
keeps its own document store, first scope is save/open online (phase 0–1 of
`erpcons-workspace/tmp/briefs/office-online-v1/plan.md`).

## Context

ERPCons Office was built with no backend: files never leave the browser, no account is needed (`CLAUDE.md` "No
backend", landing "Tệp không rời máy", "Không cần tài khoản"). The ERPCONS OFFICE ONLINE V3.0 spec (§02) adds a
Registered tier (PI ID, online storage, folders, sharing, comments, co-editing) and a Pro tier on top of the Free one,
which keeps working without sign-in and without cloud storage.

Four existing decisions assume there is no server:

| Decision | Where |
|---|---|
| No backend | `CLAUDE.md` |
| PI ID, Workspace/NAS and the §08 API are out of scope (16/10) | `docs/gap-register.md` |
| Web refresh token in `localStorage` because no BFF exists | `erpcons-account/docs/adr/0006-token-and-key-storage.md` |
| No sign-in inside the ERP embed | `erpcons-account/docs/adr/0002-sign-in-desktop-and-web.md` |

## Decision

1. **Free is unchanged.** Without sign-in the site behaves exactly as today: no request carries a document, no
   account UI beyond the optional sign-in. "No backend" and the landing promises now read "for the Free tier".
2. **Signed-in users get an online tier** served by `erpcons-office-server`, a separate Rust repo. It is reached on the
   site's own origin under `/api/v1/` (Apache reverse proxy to a local port), so the browser needs no CORS and sends the
   PI ID access token as `Authorization: Bearer`; no cookie, so no CSRF surface.
3. **Office owns the document store.** `document_id` is minted by Office and never changes; other products (ERP,
   Tekshot, UbotBuild) will link to it later (spec §01, `document_links`). ERP Drive is not the store.
4. **Editors talk to the shell through `window.erpHost`** (`docs/erp-host.md`): open with a document id and version,
   save that returns only after the server's durable acknowledgement, flush before leaving, dirty signal.
5. **Everything online sits behind `ONLINE_ENABLED`** (default `false`, locked by a test like `PI_ACCOUNT_ENABLED`). It
   needs `PI_ACCOUNT_ENABLED` too. Production kept both off until PI Platform was live; both are on from the Office
   Cloud release (M1+M2 with sign-up, owner decision of 30/10/2026, plan `office-licensing`).
6. **ADR 0006 stays for now**: tokens remain where `account.js` keeps them. Moving the refresh token behind an HttpOnly
   cookie (a BFF on the new server) is a separate decision, to take before the tier opens to the public.
7. **The ERP embed keeps Protocol v1** (ERP stores the versions). Online mode and embed mode are exclusive in v1.

## Consequences

- The site now depends on a service at runtime for signed-in users. A server outage must never block Free: the shell
  only calls `/api/v1/` after sign-in, and an unreachable server shows "Không kết nối được máy chủ" with local
  recovery, never a broken editor.
- Data the user saves online leaves the device. The landing and the sign-in screen must say so where the online tier is
  offered; the Free wording stays.
- New obligations from the spec apply to the online tier: durable write before "Đã lưu" (§07, §11), 404 without
  revealing existence (§08), audit events without document names (§12), backups and a restore drill (§11).
- `CLAUDE.md` and `docs/gap-register.md` are updated when the first online code lands, not before.
