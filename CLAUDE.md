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
npm run test:pods  # throwaway CSS 7 in memory + a cast of accounts (test/pods/)
make             # deploy targets (TARGET=test for test.nicolasdb.eu)
```

CI (`.github/workflows/ci.yml`) runs `verify`, the build and `test:pods` on
every push, and deploys the `dev` branch to test.nicolasdb.eu
(`docs/how-to/deploy-the-test-copy.md`). `claude/*` branches are tried locally
first; production is not deployed by CI.

`npm run verify` never covers sign-in or a write to a real pod. Those are in
`docs/manual-tests.md`, and a slice is not done until its section there has
been run live.

`npm run test:pods` starts Community Solid Server 7 on localhost, creates the
cast in `test/pods/cast.ts` through the CSS account API, and runs `src/lib`
unchanged against it (only `authFetch` is swapped for a cast member's
signed-in fetch). The cast follows `docs/how-to/set-up-a-collective.md`; when
one changes, change the other. Never point it at the real provider.

## Architecture

- `src/config.ts` — the kit's settings. **No collective is listed in the
  app**: a person sees the collectives their profile's `org:memberOf` links
  lead to, plus an invitation (`?collective=`) or a pasted address. The
  collective's IRI is `config.ttl#<name>`, which is also the group IRI, so
  the link from a profile dereferences to its description (`docs/examples/`).
- `src/lib/acl.ts` — WAC, per solid-kit ADR 003: parsed with a real Turtle
  parser, written as hand-written Turtle, conditional writes, and a refusal
  (never a rewrite) when an `.acl` holds something it cannot represent.
- `src/lib/collective.ts` — ADR 006, member side: config, profile and roster
  parsing, the membership state table, `as:Join` / `as:Announce`.
- `src/lib/admin.ts` — ADR 006, collective side: read the inbox, check each
  requester's profile, accept / refuse / remove (order pinned in
  `src/lib/admin.test.ts`), members from both sides. `src/lib/activity.ts`
  writes every AS message; `src/lib/vocab.ts` holds the namespaces.
- `src/admin.ts` — the collective you run, its own tab over `lib/admin.ts`:
  requests beside a members table, other messages, the invitation link.
- `src/lib/css-account.ts` — **provider-specific**: account, password login
  and pod through the CSS account API (J1). Shown only when
  `SIGNUP_PROVIDER` is set. `test/pods/` creates its whole cast with it.
- `src/signup.ts` — the screen before sign-in: sign in, or create an account
  (invitation → create first), inside the landing of `src/welcome.ts`
  (generic words, or the invited collective's from its public `config.ttl`,
  read before sign-in). `src/invite.ts` carries the invitation and the
  new account's name across the provider's sign-in page;
  `src/lib/newcomer.ts` writes that name and the inbox on the first home
  screen.
- `src/onboarding.ts` — signed in: reads the pods (`load`: the collective
  you run via `findRunCollective`, your profile, your collectives) on every
  render, then shows the tab the hash names (`src/router.ts`) inside
  `src/shell.ts` (layout A: tabs on top, a bottom bar on a phone). Tabs:
  `src/home.ts` (your collectives, joining, "You"), `src/member.ts` (a
  collective you belong to: sharing, leaving, its members and agent),
  `src/admin.ts` (the one you run); `src/steps.ts` holds the pieces they
  share. No role, progress or tab state is stored.
- `src/theme.ts` — the light / dark switch in the top bar and the landing's
  nav: light by default, kept in localStorage, never on a pod.

**Starting a session: read `docs/slices.md` first** ("Where we are" and the
next tasks), then `docs/journeys.md`. No plan lives anywhere else.

## Documentation

`docs/` follows Diátaxis (index: `docs/README.md`): tutorials, how-to,
reference, explanation, each fact in one place. `docs/faq.md` holds only
questions with a one-line answer and a link to the page that owns it; never
put an answer there that exists nowhere else. Anything about the collective's
agent, snapshots or the protocol belongs in solid-kit's ADRs, not here.

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
