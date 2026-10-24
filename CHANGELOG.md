# Changelog

Versions follow `package.json`. A tag `v<version>` publishes the image
`ghcr.io/nicolasdb/solid-backoffice:<version>` (`.github/workflows/ci.yml`);
an instance pins it in `instance-template/.env`.

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
