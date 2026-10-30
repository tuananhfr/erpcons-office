# Request to PI Platform: let the Office server verify PI ID access tokens

From: ERPCons Office. Status: draft for review (2026-10-27). Contract referenced: `erpcons-account/docs/contract.openapi.yaml`.

## Why

Office gets a server for signed-in users (`docs/adr/online-tier.md`): documents saved online at
`office.erpcons.vn/api/v1/`. Every request carries the user's PI ID access token, and the Office server must know who
the caller is before it touches a document.

The current contract makes that impossible to do properly:

- access tokens are opaque to Office (contract §1, "Access tokens are opaque to Office");
- their `aud` is the PI Platform API, not Office;
- there is no introspection endpoint and no JWKS for access tokens.

## What Office does until then

The Office server calls `GET /v1/me` with the caller's token and caches the answer for 60 s, keyed by a hash of the
token. That works with the contract as it is, but it has costs:

- it is token passthrough: Office uses a token whose audience is PI Platform;
- every new token costs one call to PI;
- PI cannot tell Office calls from client calls.

It is only meant for development against `pi-mock` and for an internal beta.

## What we ask for (either option)

**Option A: token introspection (RFC 7662).**

- `POST /oauth/introspect`, authenticated with an Office server credential (client secret or `private_key_jwt`).
- Body: `token=<access token>`.
- Response: `{ active, sub, aud, scope, exp, iat, org_context, client_id }`.
- `active: false` for expired, revoked or unknown tokens.
- Office caches positive answers until `min(exp, now + 60 s)`.

**Option B: JWT access tokens for Office (RFC 9068).**

- Tokens requested for the Office audience are signed JWTs. Example: an `aud` value of `https://office.erpcons.vn/api`,
  obtained with a `resource` parameter (RFC 8707) or with an Office-specific scope.
- Required claims: `iss`, `aud`, `sub`, `exp`, `iat`, `jti`, `scope`, `org_context`, `client_id`.
- Signing: a JWKS at `/.well-known/jwks.json` with `kid` rotation and ES256 or EdDSA.
- Office verifies offline and refreshes the JWKS on an unknown `kid`.

We prefer **Option B** for latency and load. Either works for us. Option A is simpler if revocation must take effect
before `exp`; with a 5 min web access-token lifetime, B's revocation delay is at most 5 minutes.

## Also needed

1. **Scopes for Office data.** For example `office.documents.read` and `office.documents.write`, requested by the web
   client, so a token issued to another product cannot read Office documents.
2. **Stable `sub`.** Office stores `sub` as the immutable `actor_id` (spec §06). Please confirm that it never changes
   and is never reused.
3. **Display name.** Office reads it from `/v1/me` at most once per session to snapshot author names. Please confirm
   that this call is allowed from a server holding the user's token, or include `name` in the token.
4. **Organization context.** Phase 1 stores personal documents only. When organizations come (phase 2+), Office will
   check the membership behind `org_context`, as HS05 requires. Is `/v1/me` the supported way to do that from a server?
5. **Environments.** A staging issuer and client registration for `office.erpcons.vn` (production) and a staging host,
   plus the final issuer host that replaces `id.pi.invalid`.

## What Office already supports

- OIDC Code + PKCE, rotating refresh tokens, `/v1/me`, `/v1/me/entitlements` and the signed feature catalog
  (`erpcons-account`).
- A mock of the platform (`pi-mock`) used in tests. We will add whichever option you choose to it, so that both sides
  test against the same behaviour.
