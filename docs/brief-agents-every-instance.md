# Brief for solid-backoffice: one image, every instance

From the Maps of Making install (2026-10-23/24). Signed in as
`https://nicolas-test.pod.mapsofmaking.org/profile/card#me` (server
`pod.mapsofmaking.org`, solid-css-overlay 7.2.0-5), the You screen shows no
agents section, and Maps of Making has no backoffice of its own to manage
agents from. Two ADRs in solid-kit frame the work:

- **ADR 010, accepted**: `docs/adr/010-providers-say-what-they-offer.md`.
- **ADR 011, proposed** (PR nicolasdb/solid-kit#12, agreed in substance with
  Nicolas): `docs/adr/011-an-app-is-one-image-an-instance-brings-its-look.md`.

Branch from `dev`, PR into `dev`. Two parts; A can ship without B.

## A. Agents on every instance (ADR 010)

### Why the section is hidden today

- `src/agents-view.ts:57` `onProvider`: `webId.startsWith(SIGNUP_PROVIDER)`,
  with `SIGNUP_PROVIDER` fixed to `https://pod.nicolasdb.eu/` in
  `src/config.ts:34`.
- Even set to `https://pod.mapsofmaking.org/`, the prefix test fails with
  subdomain pods: the WebID's host is `nicolas-test.pod.mapsofmaking.org`.
  It only ever worked because pod.nicolasdb.eu puts pods in folders.

### The work

1. **Detect, don't list.** WebID → `solid:oidcIssuer` → fetch
   `<issuer>/.well-known/css/provider.json` → offer what it lists (the
   descriptor ships with solid-css-overlay, brief #9 item 5: until then, no
   descriptor means "not offered"). Call only endpoints on the issuer's own
   origin; a URL in the descriptor pointing elsewhere is shown, never called
   with the person's cookie. Remove `onProvider` and its prefix test.
2. **Same-site gate for the account.** Account and onboard features only when
   the app's host and the issuer share a registrable domain (the
   `css-account` cookie is sent then, and only then). Cross-site: say where
   they are ("Your agents are managed at backoffice.mapsofmaking.org"), with
   a link.
3. **No password inside the app.** Remove `#agents-unlock`
   (`agents-view.ts:518-527`, `unlockWithPassword`). A lapsed account
   session sends the person to the provider's own login page (top-level
   navigation, back afterwards), where the address bar names the server.
4. **Shown, not hidden.** A provider without the capability: show the
   section, say what it would do and that this provider does not offer it:
   "Your provider does not offer agents. Servers running solid-css-overlay
   do." Do not name the other provider. No fake button, no nag. Replaces
   "hidden, never greyed out" in the file header.
5. **A Client ID Document** (ADR 010, point 6). Today `loginWithIdentifier`
   (`src/lib/auth.ts:100`) registers dynamically (`clientName: APP_NAME`), so
   the consent page shows a random `client_id`. Serve
   `/id.jsonld` (Solid-OIDC Client ID Document: `client_id` = its own URL,
   `client_name`, `redirect_uris`, `grant_types`, `scope`) and log in with
   `clientId` set to that URL. It must be on the deploy's own origin: see B.3.
6. **One model of an agent** (ADR 010, point 7): a WebID in its owner's pod
   (`profile/<name>#me`), linked to the owner's account, the owner a person
   or a collective. That is what the backoffice already makes; keep it, and
   say so in the agents section's copy if it says otherwise.
7. Tests: the issuer check with folder and subdomain WebIDs; cross-site →
   link, no account call made; no descriptor → the "not offered" state; the
   login passes the Client ID Document's URL.

## B. One image, configured per instance (ADR 011)

1. **The image.** A `Dockerfile` (nginx serving `dist/`, the current
   `deploy/nginx-site.conf`), and a CI job: a tag `v<version>` runs the same
   checks as a push, then publishes `ghcr.io/nicolasdb/solid-backoffice:<version>`.
   Versions in a `CHANGELOG.md`. No `:latest` in any instruction.
2. **Run-time values.** At boot the app fetches `/instance.json`; absent, the
   defaults are pod.nicolasdb.eu's current values (so today's deploy behaves
   as now). It carries what `src/config.ts` holds for one instance:
   `DEFAULT_IDENTIFIER`, `SIGNUP_PROVIDER`, `UPLOAD_LIMITS`. `APP_NAME` and
   `SESSION_ID` stay compiled: they are the app's own. Anything the server
   describes in `provider.json` is read from there, not repeated here.
3. **Generated at start**, from `PUBLIC_URL` in the container's environment:
   `/id.jsonld` (A.5), since its `client_id` and `redirect_uris` must be the
   deploy's own origin. An entrypoint script in `/docker-entrypoint.d/` (the
   nginx image runs them) is enough.
4. **The skin.** `/skin.css` is loaded after `theme.css` (a `<link>` in each
   HTML entry, after the bundle's styles); absent, a 404 costs nothing and the
   kit's look holds. Its fonts are served from a mounted folder beside it.
   The theme switch: a skin may offer one theme only (Maps of Making is riso
   paper only); decide with Nicolas whether the switch hides then, or the
   skin fills every theme from the same values.
5. **`instance-template/`**, used in place, never edited: `compose.yml`
   (image pinned by `${BACKOFFICE_VERSION}`, `${INSTANCE_NAME}` for container
   names, the gateway network external), `.env.example`, `Caddyfile.tmpl`
   (and the nginx vhost template that exists today). The look is mounted by a
   `compose.override.yml` from the vertical's design-system repo, listed in
   `.env` as `COMPOSE_FILE`, as solid-css-overlay's `overlay-template/` does.
6. **pod.nicolasdb.eu** keeps working: its current deploy is unchanged by A
   and B, and moves to the image in a later step (then `make vps-push` goes).
   Say what that step is in the README; do not do it here.

## For Maps of Making, after A and B

- DNS: `backoffice.mapsofmaking.org` A record to the VPS (Nicolas, OVH).
- `/srv/mom-backoffice`: a checkout of this repo at the tag;
  `instance-template/.env` with `PUBLIC_URL=https://backoffice.mapsofmaking.org/`
  and the version.
- `mapsofmaking/design-system` `backoffice/`: `instance.json`
  (`DEFAULT_IDENTIFIER` and `SIGNUP_PROVIDER` `https://pod.mapsofmaking.org/`,
  no upload limit until the gateway sets one) and the compose override.
- vps-infra: `gateway/sites/mom-backoffice.caddy`.
- The connector: `ONBOARD_CORS_ORIGINS=https://backoffice.mapsofmaking.org`
  and `COMPOSE_PROFILES=connector` in `/srv/mom-pods`. Then the first agent is
  made from the UI.

The local session does those steps; this repo's work is A and B.
