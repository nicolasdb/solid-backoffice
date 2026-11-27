# Changelog

Versions follow `package.json`. A tag `v<version>` publishes the image
`ghcr.io/nicolasdb/solid-backoffice:<version>` (`.github/workflows/ci.yml`);
an instance pins it in `instance-template/.env`.

## Unreleased

- **A WebID on your own domain works with every profile step** (#26,
  solid-kit ADR 002 amendment of 2026-11-26). Such a profile is a static
  file no app can write, so "Use this inbox", the name, "May act for you"
  and joining ended in a NetworkError. Each step now writes the profile
  only when its server says it may (`WAC-Allow` / `Allow`), else the
  extended profile it links in your pod, else a new `profile/about.ttl`
  (public read, you edit), and You shows the two lines to add to your
  profile, with a copy button.
- **Profiles are read with their extended profile**: the documents linked
  with `rdfs:seeAlso` or `foaf:isPrimaryTopicOf`, one level, only inside a
  `pim:storage` the profile declares. A collective checking a request, the
  members table and the agents found for a member count a membership or a
  delegation written only there. You shows the extended profile under the
  profile, with its address.

## 0.3.1 — 2026-11-24

- **Sign-up: the passphrase toggle is an eye inside the field** (#23). The
  "Show passphrase" button at the bottom of the form was easy to miss; the
  eye sits in the first passphrase field, shows or hides both, and says
  "Show passphrase" / "Hide passphrase" to screen readers.

## 0.3.0 — 2026-11-18

Collectives without an agent, and the `sc:` vocabulary (solid-kit ADR 006
§7, amended). Everything an instance had keeps working.

- **A collective can be membership only**: no agent, nothing shared. Only
  `sc:feature sc:Sharing` needs an agent (`sc:agent`); without it the app
  offers no sharing and shows no "Shares", and accepting a member grants
  Read on the roster (`membres.ttl`) alone.
- **`sc:` is read beside `hs:`, and written for new data**
  (`https://w3id.org/solid-collective/vocab#`; `hs:bundleFolder` is now
  `sc:suggestedFolder`). A `config.ttl` in `hs:` is read exactly as before;
  a term present in both is refused. `settings/collectives.ttl` and
  `settings/following.ttl` are read in both and rewritten in `sc:` on their
  next save.
- **The collective template starts membership only and in `sc:`**; the
  set-up how-to is rewritten in two halves (membership, then the pipeline),
  `guide/` is public, and step 9 gives the agent Read on `membres.ttl`.
  `schema:url` is documented as the invitation address.
- **Instance**: bump the pinned version. Nothing to migrate: an existing
  `hs:` `config.ttl` keeps working, and its owner may move to `sc:` by hand
  (ADR 006 §7).
- **Not yet run live.** `npm run verify` and `npm run test:pods` pass; the
  manual section "Creating a collective · OpenFab on Maps of Making"
  (`docs/manual-tests.md`) is still to run, on this image.

## 0.2.1 — 2026-10-24

- **The descriptor is read fresh** (`cache: "no-cache"`, one small request
  per server and page load; pod reads are unchanged): CSS serves it with
  `max-age=86400`, so a connector turned on today stayed invisible for a day.
- A server with no connector says so on each card ("No AI can be connected
  on this server"), not "unknown".

## 0.2.0 — 2026-10-24

Agents on every instance (solid-kit ADR 010, part A of
`docs/brief-agents-every-instance.md`).

- **Detect, don't list**: the agents section reads the WebID's issuer's
  `/.well-known/css/provider.json` (`src/lib/provider.ts`) and is offered
  when it lists `account` and this app is on the issuer's site. `onProvider`
  and its prefix test are gone.
- **Shown, not hidden**: without the descriptor, "Your provider does not
  offer agents. Servers running solid-css-overlay do."; across sites, where
  agents are managed, with a link. A server with no `onboard`: agents, and
  no Connect to AI.
- **No password in the app**: the unlock form is gone. A lapsed account
  session links to the provider's own page, then "read again".
- **Client ID Document at sign-in**: the login uses this deploy's
  `/id.jsonld` when it is the origin's own, so the consent page names where
  the app runs. Without it (dev server, an older deploy), dynamic
  registration as before.
- **Pod addresses in the server's layout** on the landing and sign-up:
  `amina.pod.mapsofmaking.org`, not `pod.mapsofmaking.org/amina/`.

## 0.1.0 — 2026-10-24

The first image (solid-kit ADR 011): one backoffice for every instance.

- **`Dockerfile`**: the static build behind nginx, in the Solid Kit look.
- **`/instance.json`** read at boot (`src/instance.ts`): `defaultIdentifier`,
  `signupProvider`, `uploadLimits`, which were compiled into
  `src/config.ts`. Absent or malformed, pod.nicolasdb.eu's values hold.
- **`/skin.css`** loaded after the kit's theme in every page, with its fonts
  at `/fonts/skin/`. Absent, a 404 and the kit's look.
- **`/id.jsonld`**, the Client ID Document, written at start from
  `PUBLIC_URL`. The app does not log in with it yet (part A of
  `docs/brief-agents-every-instance.md`).
- **`instance-template/`**: compose, `.env.example`, `Caddyfile.tmpl`.
- A reload keeps the place it was on (PR #11).
