# CLAUDE.md

Guidance for Claude Code working in this repository.

**Read the atlas first:** [solid-kit `docs/atlas.md`](https://github.com/nicolasdb/solid-kit/blob/main/docs/atlas.md).
It owns how this repo relates to the provider, the kit and the apps, and the
ADRs live beside it. This file owns only facts about the backoffice.

## What this repo is

The backoffice: accounts, permissions and membership. Built by copying
`solid-kit` at `b945ab8` (commit `9ed8327` here is the untouched copy), so
the kit's shell, `src/lib/{auth,pod,conditional,draft}.ts`, `src/ui/` and
`src/styles/{core,theme,patterns}.css` follow the kit's own `CLAUDE.md`.
Change them here only for a backoffice reason, and carry fixes back to the kit.

Unlike the kit, **ACL code belongs here**: the kit leaves permissions out on
purpose because they are this repo's job.

## Commands

```bash
npm install
npm run dev      # the app at /
npm run verify   # typecheck + tests + audit
npm test
make             # deploy targets
```

`npm run verify` never covers sign-in or a write to a real pod. Those are in
`docs/manual-tests.md`, and a slice is not done until its section there has
been run live.

## Architecture

- `src/config.ts` — `COLLECTIVE_CONFIGS` is the only collective-specific line
  in the app. A collective is described by its own `config.ttl`
  (`docs/examples/`), not by code.
- `src/lib/acl.ts` — WAC, per solid-kit ADR 003: parsed with a real Turtle
  parser, written as hand-written Turtle, conditional writes, and a refusal
  (never a rewrite) when an `.acl` holds something it cannot represent.
- `src/lib/collective.ts` — ADR 006, member side: config, profile and roster
  parsing, the membership state table, `as:Join` / `as:Announce`.
- `src/onboarding.ts` — slice A's screen. A checklist read from the pods on
  every render; no progress is stored.

`docs/slices.md` has what comes next and in which order.

## Rules that are easy to break

- **Membership grants nothing** (ADR 006 §2). Never put a group in an ACL;
  ACP ignores it silently. Every grant names one WebID.
- **Membership state is computed, never stored.** An unreadable roster means
  "unknown" or "pending", never "refused": applicants cannot read it.
- **Order of writes is part of the design.** Declare in the profile before
  sending the request; create and open the inbox before advertising it; grant
  before announcing. Tests in `src/onboarding.test.ts` pin each order.
- **Everything the backoffice writes is on the signed-in user's pod**, except
  messages POSTed to an inbox (pocpod0 BP-6, single writer).
- **Provider-specific features** (CSS account API, minting, access logs) go in
  their own module and are hidden for WebIDs from other providers. Everything
  else must work against any Solid server.
