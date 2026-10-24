# Changelog

Versions follow `package.json`. A tag `v<version>` publishes the image
`ghcr.io/nicolasdb/solid-backoffice:<version>` (`.github/workflows/ci.yml`);
an instance pins it in `instance-template/.env`.

## 0.1.0 — unreleased

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
