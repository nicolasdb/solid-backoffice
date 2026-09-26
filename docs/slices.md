# Slices

Each slice is usable on its own and is tested by a real person before the next
one starts. The order follows who is waiting: new members first, then the admin
who accepts them, then everyone's daily work.

## Where we are (26 Sep 2026)

Built and run live: A, B, J1, and the **layout pass** (L1 tabs, L2 the
collective's own screen, L3 the landing, L4 a member's tab), on
test.nicolasdb.eu, desktop and phone, both themes. B's last live steps
(refuse, remove, a message it does not understand) ran with it. Password
reset still needs SMTP on the provider: deferred, provider configuration.

After the pass, the same day: light theme by default (then dark, then same
as the device); Home redrawn to match the canvas (section labels, one-line
join form, a compact "You" checklist, "Edit your profile" opening it); the
canvas itself brought in line with what is built, in light, with the
dismissed options removed (layout-brief.md, Answers). The last Home change
(`6691124`) is committed; check it live once `dev` is pushed.

**How work flows now.** Work happens on the `dev` branch; pushing `dev`
deploys to test.nicolasdb.eu through CI (`.github/workflows/ci.yml`,
[deploy the test copy](how-to/deploy-the-test-copy.md)). Production is
still `make vps-deploy`.

**Next, in order:**

1. Push solid-kit `f9ad05c` (ADR 006 §5: `config.ttl` is public).
2. Carry the general fixes back to solid-kit: the redirect URL without a
   fragment (`redirectUrlFrom`, `src/lib/auth.ts`), focusView's ring for
   keyboard only (`trackInputModality`, `src/ui/a11y.ts`), and, once
   settled, `.screen-wide` and the tab bar that moves to the bottom on a
   phone.
3. **L5 · speed**: built, run live on 26 Sep 2026 (faster first load,
   instant tabs; the approach: [reading pods quickly](explanation/reading-pods.md)). Independent
   reads start at once (`load()`, `loadRun()`); a tab switch draws from the
   last load and reads again behind it; display reads revalidate with
   `If-None-Match` (`src/lib/read.ts`, CSS 7 answers 304). Memory only.
   Measured with `test/pods/speed.test.ts`. The HEAD before each `.acl`
   read is now asked once per session (C1, `aclLocation`).
   `src/lib/read.ts` and the rules are carried back to solid-kit (ADR 007).
4. **C · Places**, in six slices (C1 browse → C6 technical rules, below),
   drawn on the canvas desktop and phone: **all six built** on 26 Sep 2026
   (`f6de1ff` … `683cbf5`), each with its screen tests and its pod tests.
   First live look (26 Sep 2026): the sharing panel showed every level
   at once. Redrawn as **Pods, the iceberg** ([layout-brief](layout-brief.md))
   and reworked the same day: the tab is Pods; the list shows name, size
   and last change (sortable, columns hidden or reordered in the browser);
   `···` opens a menu, "Change who can access it" a drawer, one panel for
   folders and files with Inherit from parent; addresses drop your
   provider's host. The write logic is unchanged. Next: run
   [manual tests](manual-tests.md) "C · Pods" C1–C6 live. Then D (with
   People & apps), E.
5. **Tabs, third pass** (26 Sep 2026, [layout-brief](layout-brief.md),
   canvas "Tabs (third pass)"): built the same day. Sign-in lands on Pods
   (Collectives while an invitation waits); two tabs, Pods and
   Collectives, one collective opened inside it; Home is gone, You sits
   under the avatar with `profile/card` shown read only. Next: run its
   section of [manual tests](manual-tests.md) live, with C1–C6.

In [journeys](journeys.md) terms: J1, J3 and J5's admin side are built;
J2, J4 and J6 work already; J7 is C, J8 is D.

## A — Member side of the handshake · built

For someone who already has an account. Name, agent, inbox, join, share. The
first live test is Neil's (see `manual-tests.md`, "Slice A").

Not in A, on purpose:

- **Creating an account.** Built later, as J1 (below).
- **The agent's profile pointing back at its human.** ADR 006 wants both sides.
  The agent's profile is written when the agent is minted, which is also
  provider layer.

## Decided since A was built

The design review (draft 2) changed three things in A before B starts:
account creation moves into the first journey (username, email, password;
our provider only), the home screen splits into "You run" and "You belong
to" (built), and the shared folder becomes `output2/<collective>/` (built). Reasons:
[explanation/membership.md](explanation/membership.md),
[explanation/sharing.md](explanation/sharing.md).

## Test server · built

`npm run test:pods`: a throwaway CSS 7 and a cast of seven accounts (collective,
its agent, member, newcomer, applicant with a request sent, outsider, second
collective), set up by the
how-to. It runs the app's `src/lib` against a real server. Next: browser
journeys (Playwright, one window per account) as each journey is built.

## Layout pass · built, run live

A desktop layout that uses the width, and a real landing, drafted in Claude
Design from [layout-brief.md](layout-brief.md); the code follows the
canvas. Four slices, each run live on test.nicolasdb.eu (26 Sep 2026,
desktop and phone, both themes):

- **L1 · tabs**: Home, one tab per collective you run or belong to, Places
  shown as coming; a bottom bar on a phone.
- **L2 · the collective's own screen**: requests beside a members table
  with a filter, other messages below, the invitation link to copy.
- **L3 · the landing**: generic, or the invited collective's words from its
  public `config.ttl` (its own `schema:slogan` and `schema:description`
  when set); Newsreader self-hosted.
- **L4 · a member's tab**: sharing, membership, the roster as the member
  reads it ("once accepted" before that, never "refused"), the agent.

Found during the live run and fixed: the invitation link looked like the
bare `config.ttl` address on localhost (it now always shows the link); a
collective you already have, looked up again, now says so. Since then:
light theme by default, and Home redrawn to match the canvas.

## J1 — Account creation · built, run live

From an invitation link, the first screen offers "Create an account": name,
username (suggested from the name, the pod's address shown under it), email,
password. The CSS account API creates the account, its password login, then
the pod (`src/lib/css-account.ts`, provider-specific; `SIGNUP_PROVIDER` in
`src/config.ts`, null hides it). The provider's own page then signs the
person in, and the first home screen writes their name and inbox
(`src/lib/newcomer.ts`) from a record left in sessionStorage. Asking to join
stays one click.

As built: an empty username never reaches the provider (CSS would give away
the server root); a taken username or a used email is retried on the same
account, so a retry never leaves a second, half-built account. There is no
availability check before creating: on our provider an unused pod address
answers 401, like a private one. CSS 7 cannot delete an account through the
API, so a test account stays.

## B — Admin side of the handshake · built, live test pending

On the collective's pod, for its owner:

- read `inbox/`, list pending `as:Join` requests, showing each requester's
  own declarations (name, `memberOf`, agents);
- accept: add `foaf:member` to the roster, send `as:Accept` to the requester's
  inbox; refuse: send `as:Reject`;
- show every member's state from both sides, including "left";
- show which members share a folder with the collective's agent, from the
  `as:Announce` messages. Only the member's pod can confirm the grant.

Accepting and granting stay two writes (ADR 006 §2), even behind one click.

As built (`src/lib/admin.ts`, `src/admin.ts`): a handled `as:Join` is deleted
from the inbox, so a refused request cannot come back as pending; the short
name (`foaf:nick`) is suggested from the requester's name, editable, refused
if taken, and kept when a member is removed; removal (J5, admin side) revokes
the Read grants, then removes the `foaf:member` line, then sends `as:Remove`.
Messages the app does not understand stay visible under "Other messages".
Grants are refused before any write when a target has no `.acl` of its own.

## C — Places: your pod, and what you follow

Planned 26 Sep 2026, drawn on the canvas ([layout-brief](layout-brief.md),
"Places", both passes). Your own pod as a file browser, with the permissions
editor from `src/lib/acl.ts`, and following (J7,
[explanation/following.md](explanation/following.md)) as a read-only reader
for addresses others share with you. Every screen reads as
[reading pods quickly](explanation/reading-pods.md) says (solid-kit ADR 007).
Each slice below is usable on its own. Decided 26 Sep 2026: C1–C6 are
built in one run, each with its automated tests, and run live together at
the end ([manual tests](manual-tests.md), "C · Places").

- **C1 · Browse your pod** · built, live test pending. The Places tab and its route; "My pod" in the
  side list; a folder's items with path, name, last modified (`dct:modified`
  from the listing) and whether it has rules of its own; a file opens in
  Preview (Markdown, text, JSON, image); download for the rest. Read only.
  "Who can read it" fills in as each item's rules arrive, never holding the
  list back; where each `.acl` lives is kept in memory (it costs a HEAD).
  New: `src/lib/files.ts` (listing, reading), `src/places.ts`,
  `src/ui/markdown.ts` (marked, then DOMPurify: a pod's Markdown is
  untrusted). As built: routes `#/p/<path>` (percent-encoded, as in the
  URL); a move between folders redraws Places only, the collectives are
  not read again; share checks read each `.acl`'s location from memory
  (`readAccess`), which closes L5's last open item.
- **C2 · Who can read it** · built, live test pending. Only me / anyone with the link / named people
  ("Can read" = Read, "Can edit" = Read + Append + Write; Control never
  granted from the screen); chips filling in a collective's members, one
  WebID each (ADR 006 §2), and a person who left flagged; Restore from
  parent (never on the pod root); the technical rules shown read only.
  New in `acl.ts`: public access, removing an item's own `.acl`. As
  built (`src/access-panel.ts`): the panel edits a draft, and Save writes
  the whole state once (`setAccess`), refused when the `.acl` changed after
  the panel read it; an item that follows its folder starts from those
  rules. Restore from parent is a `DELETE` with `If-Match`, refused on
  whatever advertises `pim:Storage`. "Left" comes from the roster (a short
  name kept, no `foaf:member`) or, for the collective you run, the
  member's own profile. A grant with modes the presets have no name for
  shows as Custom and is kept; an inbox's Append for everyone signed in
  is kept too.
- **C3 · Write files** · built, live test pending. New folder, new file, upload; the editor (Preview
  first, Source beside it, Save only if nobody changed the file, a notice
  when someone did). Through `conditional.ts`. As built (`src/editor.ts`,
  writes in `files.ts`): every create is `If-None-Match: *` (CSS 7 answers
  409 for an existing folder; both read "already there"); a save is
  `If-Match`, and on a 412 the editor keeps your text and offers "Save
  mine over theirs" or "Replace my text with theirs". Unsaved text stays in
  memory across navigation, never in browser storage.
- **C4 · Rename, move, delete** · built, live test pending. Move and rename carry a folder's contents
  and their rules (the old backoffice left the files behind, found live 25
  Sep 2026); delete says how many items are inside first. Order of writes:
  copy everything, check it, only then delete; a move stopped halfway
  leaves the original whole. Pinned by a test, including a failure halfway.
  As built (`src/lib/move.ts`, `src/item-actions.ts`): an item with rules
  of its own is copied empty, then its `.acl`, then its content, so it is
  never readable under a looser folder; the copy is walked and compared
  before the source is deleted bottom up. Refused before any write: a name
  already there, a folder into itself, rules it cannot rewrite, and the
  pod, `profile/`, `inbox/`, `settings/`, `config.ttl`, `membres.ttl`.
  Move offers the folders already opened.
- **C5 · Following (J7)** · built, live test pending. Follow an address (kept only once the app could
  read it with your WebID); the list in `settings/following.ttl` on your own
  pod, with a title and excerpt from your last visit, so the overview reads
  nothing from other pods; open one read only; favourite; unfollow. As
  built (`src/lib/following.ts`, `src/following-view.ts`, format in
  [reference](reference/following-file.md)): written with n3's Writer
  through `updateDocument`; a visit is kept only when something changed or
  the last one is an hour old; unfollow can be undone. Differs from the
  board on purpose: a followed folder's rows show type and size, not each
  file's first line (one read per file on their pod).
- **C6 · Technical rules, advanced mode** · built, live test pending. The raw `.acl` editable behind
  "Show the technical rules"; Save takes two taps and is refused unless the
  Turtle parses, the owner keeps Control, and nobody changed it meanwhile.
  Desktop only. As built (`src/raw-rules.ts`, `checkRawAcl` and
  `saveRawAcl` in `acl.ts`): only rules of the item's own are editable;
  "What changes" says it in the panel's words; the armed Save waits 8
  seconds for its second tap, and any typing disarms it. The second tap is
  outlined in the warning colour (the existing `--warn` tokens), not a new
  colour.

Each slice: its `src/lib` against `test/pods` (the cast gets folders and
files), its screen against mocks, a section in `manual-tests.md`.

Not in C, on purpose:

- **Editing someone else's pod** where they granted you Write (the Xavier
  case). Following stays read only. A use case of its own, to write up
  (J9 in [journeys](journeys.md)).
- **Wipe pod contents**: dropped.

## D — Provider layer, shown only on our provider

Suggesting agents: the "Your agent" step already offers a collective
account its own `hs:agent`; D adds the WebIDs linked to the account on our
provider, so nobody types an agent's WebID by hand.

The CSS account API beyond sign-up (J1 creates the account and the first
pod): more pods on the same account, mint a WebID for an agent
(with the back-link to its human), mint and revoke connectors. Then the
Epic 9 access-log viewer. Hidden when the signed-in WebID comes from another
provider, because none of it is Solid protocol.

Full WebIDs to copy belong here too: C shows addresses without your
provider's host (`…/neil/profile/card#me`, `src/ui/address.ts`), which is
enough to recognise someone but not to paste their WebID elsewhere
(decided 26 Sep 2026).

**D lives on You** (decided 26 Sep 2026, tabs third pass in
[layout-brief](layout-brief.md)): the page under the avatar, with your
name, agent and inbox and the card's source read only, gains your pods,
agents, connectors and the access log.

**People & apps** joins D (decided 26 Sep 2026): who has access to what,
from the rules the app has read (the old backoffice's view), beside the
access log that says who actually read. Unlike the rest of D it is Solid
protocol, so it shows on any provider. No pod-wide index exists, so it can
list only the rules visited; how to present that honestly is the first
thing to settle.

**Your inbox, later (not scheduled).** The handshake lives in two files:
`org:memberOf` in your `profile/card`, `foaf:member` in the collective's
roster. The `as:Accept` / `as:Reject` / `as:Remove` a collective posts to
your inbox change nothing; nothing reads them today, and deleting one
changes no state. Two uses to come: show "Refused" from an `as:Reject`
(the roster cannot say it to someone it refused), and the inbox as mail
between members, since any signed-in WebID may append to it (a member
shares minutes that name you, gives you edit on them, and posts a note to
your inbox; your agent could do the same).

## E — Maps of Making landing

The same app with a second `config.ttl` and its own entry page. If that needs
more than a config line and copy, the backoffice is not generic enough yet, and
that is the finding.

## Replacing the old backoffice

`pocpod0/backoffice/` stays live until everything below is covered or
dropped on purpose. Inventory taken from its code (`index.html`, `pod-api.js`),
not its HANDOFF.md, which is older than several features.

| Old feature | Where it goes | Note |
|---|---|---|
| Sign in with a pod or issuer | kit | done |
| Membership, join, share | A | done; new, the old one had none |
| "Requests" view | B | demo cards only in the old app; B makes it real |
| File browser, new file / folder | C | |
| Upload, rename (copy then delete), delete with a count of what is inside | C | rename must move a folder's contents too |
| Editor with live preview (Markdown, JSON check, code) | C | |
| Wipe pod contents, protected paths kept | dropped | decided 26 Sep 2026 |
| Sharing: only me / anyone with the link / one WebID read or edit | C | `acl.ts` already writes all three |
| Raw WAC view ("Show the technical rules") | C | |
| People & apps (who has access, from ACLs visited) | D | no pod-wide index exists; same limit; shown on any provider |
| Create an account and pod (email, password) | J1 | done; guard kept: CSS treats an empty pod name as "claim the root" |
| More pods on the same account | D | |
| Agent WebIDs, linked by ownership proof; unlink | D | |
| App tokens (client credentials): list, create, revoke | D | |
| Claude connector: mint, list, revoke (`/onboard/*` on the provider) | D | the secret never reaches the browser; keep it so |
| 10-chapter learning onboarding for newcomers | open | decide: port with D's account creation, or drop |
| Demo pod (explore without an account) | open | ADR 005: per app; decide if the backoffice needs one |
| Readable-font toggle, alternate themes | open | the kit has light/dark only |
