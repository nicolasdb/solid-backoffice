# Brief for solid-backoffice: agents for every instance of the overlay

From the Maps of Making install (2026-10-23). Signed in as
`https://nicolas-test.pod.mapsofmaking.org/profile/card#me` (server
`pod.mapsofmaking.org`, solid-css-overlay 7.2.0-4), the You screen shows no
agents section. The design is a **proposed** ADR, to deliberate first: solid-kit
`docs/adr/010-providers-say-what-they-offer.md` (branch
`adr-010-provider-descriptor`, https://github.com/nicolasdb/solid-kit/pull/11). Work starts once it is accepted, on a branch
with a PR into `dev`.

## Why it is hidden today

- `src/agents-view.ts:57` `onProvider`: `webId.startsWith(SIGNUP_PROVIDER)`,
  with `SIGNUP_PROVIDER` fixed to `https://pod.nicolasdb.eu/` in
  `src/config.ts:34`.
- Even set to `https://pod.mapsofmaking.org/`, the prefix test fails with
  subdomain pods: the WebID's host is `nicolas-test.pod.mapsofmaking.org`.
  It only ever worked because pod.nicolasdb.eu puts pods in folders.

## The work

1. **Detect, don't list.** WebID → `solid:oidcIssuer` → fetch
   `<issuer>/.well-known/css/provider.json` → offer what it lists. Call only
   endpoints on the issuer's own origin. Remove `onProvider`'s prefix test.
   `SIGNUP_PROVIDER`, `DEFAULT_IDENTIFIER`, `UPLOAD_LIMITS` become deploy
   config (or come from the descriptor), so one build serves every instance.
2. **Same-site gate for the account.** Account and onboard features only when
   the app's host and the issuer share a registrable domain (the
   `css-account` cookie is sent then, and only then). Cross-site: say where
   they are ("Your agents are managed at backoffice.<their domain>"), with a
   link.
3. **No password inside the app.** Remove `#agents-unlock`
   (`agents-view.ts:518-527`, `unlockWithPassword`). A lapsed account
   session sends the person to the provider's own login page (top-level
   navigation, back afterwards), where the address bar names the server.
4. **Shown, not hidden.** A provider without the capability: show the
   section, say what it would do and that this provider does not offer it
   ("Servers running solid-css-overlay do"). No fake button, no nag. Replaces
   "hidden, never greyed out" in the file header.
5. Tests: the issuer check with folder and subdomain WebIDs; cross-site →
   link, no account call made; no descriptor → the "not offered" state.

## For Maps of Making

The account features only work from a backoffice served on a
`*.mapsofmaking.org` host: `backoffice.mapsofmaking.org` (DNS not set yet),
deployed as `/srv/mom-backoffice` behind the VPS gateway, with
`ONBOARD_CORS_ORIGINS` on the connector listing it.
