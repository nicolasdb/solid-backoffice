# CLAUDE.md

Guidance for Claude Code working in this repository.

**Read the atlas first:** [solid-kit `docs/atlas.md`](https://github.com/nicolasdb/solid-kit/blob/main/docs/atlas.md).
It owns how this repo relates to the provider, the kit and the apps, and the
ADRs live beside it. This file owns only facts about the backoffice.

## What this repo is

The backoffice: accounts, permissions and membership. Built by copying
`solid-kit` at `b945ab8` (commit `9ed8327` here is the untouched copy), so
the kit's shell, `src/lib/{auth,pod,conditional,draft,read}.ts`, `src/ui/` and
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
  `getAccess` is a write's base (always fresh); `readAccess` is for showing
  (the `.acl`'s location from memory, the document through `read.ts`).
- `src/lib/collective.ts` — ADR 006, member side: config, profile and roster
  parsing, the membership state table, `as:Join` / `as:Announce`.
- `src/lib/admin.ts` — ADR 006, collective side: read the inbox, check each
  requester's profile, accept / refuse / remove (order pinned in
  `src/lib/admin.test.ts`), members from both sides. `src/lib/activity.ts`
  writes every AS message; `src/lib/vocab.ts` holds the namespaces.
- `src/admin.ts` — the collective you run, its own tab over `lib/admin.ts`:
  requests beside a members table, other messages, the invitation link.
- `src/lib/sharing.ts` — sharing the folder a member picked with a
  collective's agent (slice G): adds to the folder's rules, never replaces
  them (the agent Can read, your `acl:delegates` Can edit); stopping asks
  what the rules become (`stopPlan`: keep the rest, follow the folder
  above, only you and your agents) (`docs/explanation/sharing.md`). Copies
  of inherited rules start from `followedBy` (`src/lib/files.ts`): only
  what a folder passes on with `acl:default`. `src/lib/shared-folders.ts` keeps the
  choice in `settings/collectives.ttl` (you and your agents only);
  `src/lib/settings.ts` writes `settings/README.md`.
- `src/lib/css-account.ts` — **provider-specific**: account, password login
  and pod through the CSS account API (J1). Shown only when
  `signupProvider` is set (`/instance.json`, `src/instance.ts`). `test/pods/` creates its whole cast with it.
- `src/signup.ts` — the screen before sign-in: sign in, or create an account
  (invitation → create first), inside the landing of `src/welcome.ts`
  (generic words, or the invited collective's from its public `config.ttl`,
  read before sign-in). `src/invite.ts` carries the invitation (`?collective=`), an open link
  (`?open=`, landing in Pods or on the followed view) and the new
  account's name across the provider's sign-in page;
  `src/lib/newcomer.ts` writes that name and the inbox on the first home
  screen.
- `src/onboarding.ts` — signed in: reads the pods (`load`: the collective
  you run via `findRunCollective`, your profile, your collectives) on every
  render (a tab switch draws from the last load first), then shows the
  screen the hash names (`src/router.ts`) inside `src/shell.ts` (tabs on
  top, a bottom bar on a phone; the avatar opens You). `#/` lands on Pods,
  or on Collectives while an invitation waits. Tabs: Pods, then
  Collectives (`src/collectives.ts`: the one you run, the ones you belong
  to, joining); one collective opens inside it as `src/member.ts`
  (sharing, leaving, its members and agent) or `src/admin.ts` (the one you
  run). `src/you.ts` is You (name, inbox, may act for you, your agents on our
  provider, and `profile/card` read only with the steps' lines marked). `src/steps.ts` holds the pieces they
  share. No role, progress or tab state is stored.
- `src/places.ts` — Pods (slice C, the tab once called Places): your pod
  as a file explorer, built as an iceberg (list → `···` menu → access
  drawer → technical rules; columns kept in localStorage), mounted
  into its own frame by `onboarding.ts` (`#/p/<path>`, `#/f`), with its
  own memory of listings, rules and files (ADR 007), forgotten at
  sign-out. `src/lib/files.ts` lists folders, reads files (headers first: a
  file with no preview, or too large for one, is not downloaded), uploads
  with progress (`src/lib/upload.ts`: the session signs, an XHR sends) and finds which
  rules apply (`effectiveAccess`); `src/ui/markdown.ts` renders a pod's
  Markdown through DOMPurify, never raw; `src/ui/mermaid.ts` draws its
  ```` ```mermaid ```` blocks (loaded on demand, strict, SVG sanitized), and
  `src/ui/pictures.ts` its relative images (read with your WebID).
  `src/lib/word.ts` (slice I) shows a `.docx` as a page and writes its
  Markdown copy beside it (`<name>.md`, `<name>-images/`), never over
  anything; mammoth and Turndown load on demand. `src/access-panel.ts` is its
  "Who can access it" panel (C2), the same for folders and files (Only me,
  Inherit from parent, Anyone with the link, named people): a draft saved
  in one conditional write,
  chips that fill in one WebID each. `src/editor.ts` edits text files
  (C3): Preview first, saves with `If-Match`, unsaved text in memory only.
  `src/lib/move.ts` (C4) moves, renames and deletes, contents and rules
  included: copy, check, then delete (order pinned in `move.test.ts`);
  `src/item-actions.ts` is its part of the `···` menu, which also copies
  "Link" (`?open=`, `src/invite.ts`) and "Raw" (the pod address). `src/lib/following.ts`
  (C5) keeps what you follow in `settings/following.ttl`, so the list
  (`src/following-view.ts`) reads nothing from other pods.
  `src/raw-rules.ts` (C6) edits an item's own `.acl` by hand, desktop only:
  two taps, refused unless it parses and you keep Control.
- `src/lib/agents.ts` — **provider-specific** (slice D): the account
  session (the provider's cookie, or a password unlock kept in memory),
  agents at `profile/<name>#me` (four writes, undone on failure), folder
  grants, the connector's `/onboard/` mint, grants and revoke, delete in
  order (connector, rules, profile, unlink, retire). `src/agents-view.ts`
  draws it on You, only for our provider's WebIDs (`onProvider`), and
  forgets it all at sign-out.
- `src/ui/address.ts` — addresses on screen without your provider's host
  (`…/neil/profile/card#me`). A whole WebID is copied with a click on the
  members lists (`copyable` in `src/steps.ts`, like the invitation link);
  the people screen is D's.
- `src/lib/read.ts` — display reads with an in-memory ETag cache
  (`If-None-Match`, 304 hands back the kept body); writes never use it.
  Forgotten at sign-out, with the last load.
- `src/ui/theme.ts` — the kit's theme button, in the top bar and the
  landing's nav: Light (the default) → Dark → Same as this device, kept in
  localStorage under the kit's key, never on a pod. `index.html`'s first-paint
  script resolves "same as this device" (dark, High contrast or light) and
  follows it; it also carries over the old `backoffice:theme` once. Wired once
  on `#app` in `src/main.ts`, never per render.
- `src/styles/` — the kit's `core.css`, `theme.css`, `patterns.css`,
  `editorial.css` (the landing, `.hint`, the brand, the icon button) and
  `fonts.css` (Newsreader, Commit Mono), unchanged. `backoffice.css` holds
  only what is the backoffice's own: the shell and its tabs, `.ladder`, Pods.
  Pods uses the kit's `renderProgress` for uploads and `.prose.prose-card`
  for a document opened; the file view's column (`.places-file`) is its own.
  Help under a field and the line under a form are `.hint`, never `.meta`.

**Starting a session: read `docs/slices.md` first** ("Where we are" and the
next tasks), then `docs/journeys.md`. No plan lives anywhere else.

## Documentation

`docs/` follows Diátaxis (index: `docs/README.md`): tutorials, how-to,
reference, explanation, each fact in one place. `docs/faq.md` holds only
questions with a one-line answer and a link to the page that owns it; never
put an answer there that exists nowhere else. `templates/collective/` is not
docs: it is what a collective copies onto its pod (`config.ttl`,
`membres.ttl`, `guide/` in French for its members, with answers of its own),
and its `config.ttl` is parsed by `src/lib/collective.test.ts`. Anything about the collective's
agent, snapshots or the protocol belongs in solid-kit's ADRs, not here.

## Rules that are easy to break

- **Membership grants nothing** (ADR 006 §2). Never put a group in an ACL;
  ACP ignores it silently. Every grant names one WebID.
- **Membership state is computed, never stored.** An unreadable roster means
  "unknown" or "pending", never "refused": applicants cannot read it.
- **Order of writes is part of the design.** Declare in the profile before
  sending the request; create and open the inbox before advertising it; grant
  before announcing. Tests in `src/onboarding.test.ts` pin each order. A move
  copies (own rules before content), checks, then deletes
  (`src/lib/move.test.ts`).
- **Everything the backoffice writes is on the signed-in user's pod**, except
  messages POSTed to an inbox (pocpod0 BP-6, single writer).
- **Provider-specific features** (CSS account API, minting, access logs) go in
  their own module and are hidden for WebIDs from other providers. Everything
  else must work against any Solid server.
