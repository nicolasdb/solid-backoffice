# solid-kit

The shared starting point for small apps that read and write a Solid pod.

Pods are the input source and the output target; the app is the process UI. This
kit is everything that is the same across those apps — signing in, finding the
pod, the design system, the deploy pattern — so a new app starts at the part
that is actually its own.

It is a **template repository**, not a package. Start an app by copying it; pin
which version you copied in the app's README. See
[`docs/adr/004-kit-is-copied-not-packaged.md`](docs/adr/004-kit-is-copied-not-packaged.md)
for why, and when that should change.

## Start an app from it

```bash
git clone https://github.com/nicolasdb/solid-kit my-app && cd my-app
rm -rf .git && git init
# Only if npm install fails with EACCES on the cache — a root-owned ~/.npm,
# usually left behind by an earlier `sudo npm`:
sudo chown -R "$(id -u):$(id -g)" ~/.npm
npm install
npm run dev
```

The app is at `/`. Two reference pages ship alongside it and are linked from the
home screen once you are signed in: `/styleguide.html` (the design system) and
`/guidelines.html` (the UX patterns, running).

Then, in order:

1. `src/config.ts` — `APP_NAME`, `SESSION_ID` (**must be unique per app**),
   `DEFAULT_IDENTIFIER`.
2. `index.html` — `<title>` and `lang`.
3. `Makefile` — the four settings at the top (`APP`, `DOMAIN`, `CONTAINER`,
   `REMOTE`).
4. `docker-compose.yml` — service name, `container_name`, labels.
5. `deploy/gateway-vhost.conf.tmpl` — fill the placeholders, install the result
   into `hetzner-gateway` as `nginx/conf.d/<order>-<slug>.conf` and deploy from
   there. That repo stays the source of truth for routing.
6. `src/main.ts` — replace `renderHome`. Everything above it is the part worth
   keeping. The links to both reference pages live inside `renderHome`, so
   replacing it removes them too — nothing to configure off.

## What's in it

| Path | What it does |
|---|---|
| `src/lib/auth.ts` | Sign in with an OIDC issuer **or** a WebID, no hardcoded provider. Own `Session` with a per-app storage id. `completeLogin` never throws — it reports `offline` when the session state can't be determined. |
| `src/lib/pod.ts` | Two-tier pod-root discovery, `ensureContainer`, `exists`, and `isAuthError` / `describePodError` — which is how a 401 stops being mistaken for a missing resource. |
| `src/lib/conditional.ts` | ETag reads and `If-Match` writes for documents something else also writes. One retry on a 412, then report the conflict. |
| `src/lib/draft.ts` | `makeDraftStore<T>` — keeps unsaved work in `localStorage` with a TTL, for the window where the browser holds the only copy. |
| `src/styles/core.css` | Structure: spacing scale, radii, reset, layout primitives, and the slot contract a theme fills. Project-agnostic — don't edit per app. |
| `src/styles/theme.css` | Identity: the pod design system's daylight/ink palette, light and dark, mapped onto those slots. This is the file to fork for a different look. |
| `src/ui/patterns.ts` | The UX patterns as components: concept card, phase rail, comprehension checkpoint, empty state, pending state, undo toast. A limit enforced by a component cannot be violated by accident. |
| `src/ui/a11y.ts` | `focusView` and `announce` — what keeps a screen change perceivable when the screen is replaced wholesale. |
| `src/ui/ux.ts` | The UX preferences that are values: chunks per step, options per choice, undo window. Change them here; the tests and the audit follow. |
| `styleguide.html` | The design system rendered from its own tokens, with measured contrast ratios and a theme switch. Ships in `dist/`. |
| `guidelines.html` | The UX patterns, running — every example rendered by the function an app calls. Ships in `dist/`. |
| `scripts/audit.mjs` | The design rules a machine can decide — contrast, token completeness, a11y affordances. |
| `deploy/`, `Makefile`, `docker-compose.yml` | Build locally, rsync `dist/`, serve from an nginx container behind the shared gateway. |

Not included, on purpose: no demo-mode framework, no ACL/permission helpers, no
data-format helpers, no vocabulary. See the ADRs.

### Setting a UX preference

Three tiers — put a preference in the strongest one that can hold it:

1. **A constant**, in `src/ui/ux.ts` or `core.css`, checked by `npm run audit`.
2. **A component**, in `src/ui/patterns.ts` — `renderConceptCard` throws at a
   fifth chunk rather than truncating, so the limit is real rather than hoped for.
3. **A checklist question**, in `docs/manual-tests.md`, for what stays judgment.

To change one: edit the constant, run `npm test`, and expect a failure if a
component depended on the old value. Never work around a constant inside a
component — that is how the tiers stop meaning anything.

## Commands

```bash
npm run dev      # app at /, design system at /styleguide.html, UX at /guidelines.html
npm run verify   # typecheck + tests + design audit. Run this before adopting a version.
npm run check    # typecheck only
npm test         # unit tests (vitest)
npm run audit    # contrast ratios, token completeness, a11y affordances
npm run build    # typecheck + production build into dist/
make             # lists the deploy targets
```

## Validating it

Three layers, and they cover different things — the automated ones do not cover
sign-in and must not be read as if they did.

**1. `npm run verify`** — 83 unit tests plus the design audit. The tests cover
the logic that carries a "this broke before" comment: the Link-header parse and
the stop-at-first-match walk, the 412 retry, draft expiry, accent folding, local
vs UTC dates, and the sign-in error messages. All of it runs with a stubbed
fetch — no pod needed. The UX patterns are covered too: that a fifth chunk
throws rather than truncating, that a wrong checkpoint answer explains itself,
that only one toast exists at a time, and that `focusView` lands on the new
view's heading.

The audit computes WCAG contrast for every text token against every surface in
both themes, checks that no color token is defined for one theme and missing
from the other, and checks the affordances that have been got wrong in real
code: focus-visible, reduced-motion, safe-area insets, a `.visually-hidden`
that does not use `display:none`, and that the UX limits are actually
referenced by the components meant to enforce them.

**2. `/styleguide.html` and `/guidelines.html`** — the design system and the UX
patterns, both rendered from themselves. The styleguide reads every value back
out of the live CSS; the guidelines page renders each pattern with the same
function an app calls and quotes its limits from `src/ui/ux.ts`. Neither can
claim something the code does not do.

**3. [`docs/manual-tests.md`](docs/manual-tests.md)** — sign-in, session restore,
pod discovery, expired sessions, and the mobile layout. **A kit version is not
validated until this has been run against a live provider**, on a real machine
with real credentials. It is not automatable and is not attempted here.

## Documentation

- [`docs/atlas.md`](docs/atlas.md) — the ecosystem this belongs to: which repo
  owns what, and the rule about which layers may talk to which.
- [`docs/ux-principles.md`](docs/ux-principles.md) — the interaction rules these
  apps are built to, and where each came from. `/guidelines.html` is the same
  rules running.
- [`docs/manual-tests.md`](docs/manual-tests.md) — the suite you run locally
  against a live provider. The authority on whether a version is fit to build on.
- [`docs/adr/`](docs/adr/) — decisions with reasons, including the ones that
  came from being wrong in production.
