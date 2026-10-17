# Slices

Each slice is usable on its own and is tested by a real person before the next
one starts. The order follows who is waiting: new members first, then the admin
who accepts them, then everyone's daily work.

## Where we are (17 Oct 2026)

**Pods reads more than text, all run live 17 Oct:** Mermaid diagrams with
fit, full screen, pan and zoom ([H](#h--mermaid-in-the-markdown-preview--built-17-oct-2026));
Word files previewed and copied to Markdown with their images, at upload
or from the page ([I](#i--documents-in-pods-word-then-pdf--built-17-oct-2026));
PDF, SVG, sound and video, the 100 MB limit said before sending, no
download for what has no preview, and upload progress byte by byte
([J](#j--media-in-pods-images-audio-video--built-17-oct-2026)). Decided,
for the other repos: the collective's pipeline converts a shared `.docx`
with pandoc and a PDF with docling, keeps Markdown and images, drops the
`.docx` once a check in code passes
([Documents on a pod](explanation/documents.md)). Not yet written there:
solid-kit ADR 006's amendment (pull rule 5) and pipeline B in
solid-css-overlay. Due here: the members' guide page on the ways into a
pod.

## Where we were (16 Oct 2026)

**G closed**: a member picks the folder they share; stop sharing asks what
the folder's rules become; a security fix on copied rules. Details and
what is left in [G](#g--share-the-folder-you-choose--built-run-live-closed-16-oct-2026).

**Later the same day:** contribution v3 (solid-kit PR #5): a member's agent
deposits in the folder chosen in `settings/collectives.ttl`; no entry means
nothing is shared, never a fallback to `hs:bundleFolder`. The procedures and
the `collectif` skill move beside the connector, in solid-css-overlay
`mcp-connector/` (overlay PR #1, solid-kit PR #6). Xavier's share stays held
back: `.docx`, `.pdf`, pictures and Markdown with base64 images break the
pull, because the bytes pass through the LLM. The fix is written and
deferred until the migration from pocpod0 is confirmed:
`solid-css-overlay/mcp-connector/docs/collective-pipeline.md` (pull as code,
derived text, batches for a backlog, the trigger from CSS webhooks on the
inbox; A → B → D → C). One WebID per agent: the puller is `hs:agent`, the
confronter has its own.

Done 17 Oct: the folders shared or granted before 16 Oct checked in a
private window; solid-kit #5 and #6, overlay #1 and #2 merged (the overlay's
`main` now holds the image, the connector and the procedures). The
collective's docs came here from solid-kit: what a collective copies onto
its pod is in `templates/collective/` (`config.ttl` and `membres.ttl`
templates, parsed by the tests; the members' `guide/`), and
create-a-collective was merged into the how-to and the reference's pod tree.

**Next, in order:**

1. **The pipeline** (overlay, after the migration): A → B → D (D includes
   the summary before sharing, here in the Share panel) → C. Then copy the
   procedures to HyperScope's pod (`principles/`, contribution v3 included),
   then E step 4 with Xavier.
2. The 10 Oct list below (Maps of Making live, ADR 006 §7, `sb:agent`
   optional, E).
3. G's leftovers: moving a shared folder re-announces; the agent folder
   picker with suggestions and the four questions; items with rules of
   their own counted; a base `select` style in solid-kit.
4. **Small, any time:**
   - **Agent names that tell collectives apart** (17 Oct). Several
     collectives' agents all showed as "agent": the label comes from the
     agent document's `foaf:name`, else the address's last part. The WebID
     never changes (members' rules name it); only the name shown does.
     - Setting up a collective proposes the agent's name as
       "<collective>·pull" (its one role, ADR 006 amendment to come); the
       address follows from it and stays editable.
     - With no `foaf:name`, show "<pod> / <last part>", not the last part
       alone.
     - Chips stay short: cut a long name with an ellipsis, the full name
       and the WebID on hover and copy.
     - The label taken from the member's own `config.ttl`
       ("HyperScope's agent") keeps priority over `foaf:name`, which the
       agent declares about itself.
   - **Mermaid**: built 17 Oct, to run live ([H](#h--mermaid-in-the-markdown-preview--built-17-oct-2026)).
5. **Documents, Word then PDF** ([I](#i--documents-in-pods-word-then-pdf--built-17-oct-2026)): built and
   run live 17 Oct. Pipeline B still handles the `.docx` a member shares
   unconverted, so I helps Xavier's share without unblocking it.
6. **Media** ([J](#j--media-in-pods-images-audio-video--built-17-oct-2026)): built and
   run live 17 Oct (video: not in Fedora's Firefox, see J).

## Where we were (10 Oct 2026)

**Maps of Making, the second collective, is set up for membership only.**
Pod `https://pod.nicolasdb.eu/mapsofmaking/` (account
`mom@mapsofmaking.org`), files in [`examples/mapsofmaking/`](examples/mapsofmaking/):
`config.ttl` public (checked: 200, `public="read"`, same bytes as the
example), `membres.ttl` empty and owner-only, `inbox/` created from the
profile panel. No agent, procedures, guide or `sujets.ttl` yet; `hs:agent`
names `agents/agent#me`, which does not exist, because the parser requires
one. Founding member Nicolas, then Jason.

**Namespace proposal** (solid-kit ADR 006 §7): `hs:` moves to
`https://w3id.org/solid-backoffice/vocab#` (one namespace for protocol, app
and pipeline terms); each collective may own a namespace for its own
fields, asked through `sb:requires` (SHACL); features as `sb:feature`, and
`sb:agent` optional for a membership-only collective. Uploaded configs keep
`hs:` until the migration runs.

**Next, in order:**

1. **Maps of Making live**: join as Nicolas, accept as `mom`, invite
   Jason; add `schema:slogan` / `schema:description` to its `config.ttl`.
2. **Deliberate ADR 006 §7**, then migrate: w3id redirect and `vocab.ttl`;
   `vocab.ts` reads both IRIs, writes the new one; the two configs, the
   template and the procedures (by ceremony).
3. **`sb:agent` optional / `sb:feature`**, so a membership-only collective
   names no agent and shows no sharing.
4. E's list below, unchanged.

## Where we were (1 Oct 2026, end of day)

**E: the loop ran both ways with procedures that serve any collective.**
Done today, across four repos:

- **Generic procedures** (solid-kit `docs/procedures/`): pull v2,
  confrontation v3, contribution v2 hold no collective's address; each
  resolves it from `config.ttl`, and pull and confrontation stop unless the
  connector is `hs:agent`. On HyperScope's pod they live flat in
  `principles/`, beside `cultivate.md`; `procedures/` is deprecated.
- **`config.ttl`** gains `hs:procedures <principles/>` and
  `hs:guide <guide/>` ([reference](reference/collective-files.md#agent-entry-points)),
  added by hand on HyperScope's pod. It stays owner-write only: the
  agent's attempt to edit it got a 403, as it should.
- **`solid_whoami`** in pocpod0's connector (`63d9e5f`, deployed): the
  WebID a connector acts as. Both connectors answered as expected.
- **The `collectif` skill** (solid-kit `skills/collectif/`): who am I →
  who delegates to me (the human's profile, or the collective account's for
  the common agent) → which collective → `hs:procedures` → role → load;
  procedures trusted only when listed directly in `hs:procedures`.
- **`guide/`** (onboarding, FAQ, glossary) on the pod, public; generic
  copy in solid-kit. [Creating a collective](https://github.com/nicolasdb/solid-kit/blob/main/docs/collectives/create-a-collective.md)
  holds the pod tree, generic vs local, access per path.
- **Roster**: `test-easy` and `testy` nicks removed by hand. Keeping a nick
  after removal stays intended; a nick without `foaf:member` is a
  reservation, and the procedures report it as such.
- **Uploads truncated** past ~6 s: the gateway streamed request bodies to
  CSS, whose write lock expires after 6 s and leaves the bytes received as
  the file. hetzner-gateway now buffers request bodies (deployed, checked
  with a throttled PUT; the 6 MB PNG re-uploaded whole).

**Run live** (two claude.ai projects, one connector each): the common
agent pulled 3 snapshots, set the two removed members' sources to
`membre-retire`, confronted 3 🟧, loaded 26/26; the member's agent drew on
the graph, deposited after confirmation, and the next pull and
confrontation brought it back linked to its three sources. Record and
proposals: solid-kit ADR 006 "Live evidence", procedures README
"Proposed, not adopted".

**Next, in order:**

1. **The loop with Xavier**: the only test one author cannot pass
   (cross-member queries return nothing today). Onboarding through the
   backoffice, his deposit, a query that finds both authors.
2. **Deliberate the four procedure proposals** (file not folder in
   `s-appuie-sur`; `sources.ttl` by append; abstracts naming methods;
   weight for the author's `sujets:`), then apply the adopted ones in
   solid-kit and copy them to `principles/`.
3. **Run the pipeline unattended**: options A–D below, unchanged, except
   that procedures are read from `hs:procedures`, not `procedures/`.
4. **Binaries**: the PNG waits as `binaire-en-attente`; the connector reads
   text only. Either a binary read in the connector, or the Hermes routine.
5. **Backoffice follow-ups**: grant members Read on `guide/` at acceptance
   (public by hand today); after a failed or partial upload, check the
   stored size and say so (CSS keeps the partial bytes on a 500); a
   « mettre à jour les procédures » command, run as a ceremony.
6. **Before real members**, still open: review `sujets.ttl` (now 15
   topics), `foaf:name` of `hyperscope_ndb` → "Nicolas", `inbox/` Read only
   for the agent.
7. **Manual checks**: E 1–10, D 1, 2, 9, 10 in [manual tests](manual-tests.md).
8. **`hs:` namespace**: hosted on HyperScope's pod, used by all; a neutral
   one is to deliberate (solid-kit ADR 006, open).

## Where we were (1 Oct 2026, morning, paused)

**Paused on E, at the automation question.** The loop runs live by hand on
both sides (below). What remains for E, in order:

1. **Choose how the pipeline runs unattended.** Options, from the 30 Sep
   discussion:
   - **A. A Claude routine on a schedule** (cloud agent, the account's
     `hyperscopeMain` connector, procedures read from the pod's
     `procedures/`): no code, at most once an hour, stops early when the
     pull finds nothing. Suggested first. Open: frequency, model, where the
     report goes (a file on the pod, or the run log only); its git source
     would be solid-kit.
   - **B. Event-driven through GitHub**: a relay on the VPS turns the Solid
     notification into a GitHub event that fires the routine. Needs the
     relay, a GitHub token on the VPS, and checking that routines accept
     `repository_dispatch`.
   - **C. The Claude API called by the relay**, with the connector as a
     remote MCP server: event-driven, paid by API key.
   - **D. Hermes** (`hermes-openfab` on the VPS: cron, HMAC webhook with
     coalescing, MCP), a hyperscope profile.
   For B–D, first pin on the local CSS 7 (`test/pods`) what ADR 006 leaves
   open: does a container subscription fire when an existing file is
   modified, for subfolders, and after a restart. The relay (subscribe as
   the collective's agent to each followed source and `inbox/`,
   re-subscribe before 14 days, forward to the runner) would live in the
   connector. Later: pull and ingest as code, the model only for the
   confrontation.
2. **The loop with Xavier**: onboarding through the backoffice (raise first
   the "Économie du commun" flag naming him co-lead), his contribution, his
   agent drawing on the graph.
3. **Before real members**: review `sujets.ttl` (13 topics, all new), remove
   `test-easy` and `testy` from the roster (and ask about testy's PDF),
   `foaf:name` of `hyperscope_ndb` → "Nicolas", check `inbox/` gives the
   agent Read only, give `procedures/` Read only for the agent.
4. **Manual checks still open**: E 1–10 in [manual tests](manual-tests.md)
   (today's fixes: free short name, refusal and removal with a reason shown
   on the member's side, Markdown preview), D 1, 2, 9, 10.

Open decisions for the collective: whether `depots/sources.ttl` stays
readable by members (it is, and so is in the graph); what leaves the graph
when a member leaves.

## Where we were (29 Sep 2026)

**E · The collective's graph, with HyperScope as the proof** started on 29
Sep 2026 (below, under E). The hypothesis: a member's summary, pulled,
confronted and loaded into Oxigraph, is found by another member's agent in
a new conversation, which builds on it and names its author. Built so far:
pocpod0's connector has `graph_ingest` (the collective's agent only) and
`graph_query` (members and their declared agents, read-only, over what they
can read on the pod), deployed; and here, accepting a member grants their
agents too; the procedures for it are written (solid-kit). **Run live the
same day:** the collective's agent and Nicolas's agent (declared by
`hyperscope_ndb`, granted with "Let them read it") both query the graph
from claude.ai and see the same 7 `provenance.ttl`; the agent reads "for
the collective", yours "for `hyperscope_ndb`". A first deploy missed the
fix letting the collective's agent query (the VPS copy is rsynced by
`make vps-deploy`, not pulled from git). Next: confrontation v2 on one
snapshot (TransiStore), then the loop with Xavier.
**29–30 Sep 2026, both halves run live.** Collective side: pull,
confrontation v2 (8 catch-up sidecars, 13 topics), 20/20 documents
ingested, a topic query found two documents through a synonym. Member side:
a new chat with Nicolas's agent drew related topics from the graph into
the conversation and wrote a new contribution to `output-to/hyperscope/`,
citing its sources in `s-appuie-sur:`, ready for the next run. Fixed from
that use: a free short name when the plain one is taken, a refusal or
removal shown on the member's side (with the admin's reason) instead of
"pending" forever, Markdown previews styled and their YAML header shown as
fields. Next: the loop with Xavier, then running the pipeline unattended.

**C · Pods is closed** (27 Sep 2026): built, used live on
test.nicolasdb.eu, and reworked from what that showed (below, under C,
"Closed"). With it the tabs' third pass and the sharing fixes.

**D · Your agents is closed** (27 Sep 2026, after its main journey ran
live). Create an agent, connect it to an AI, choose its
folders, revoke, delete, all on You (below, under D). pocpod0's connector
now allows test.nicolasdb.eu. **Run live the same day:** an agent created,
connected in claude.ai, given two folders (read and edit), its connector
revoked, then deleted and retired (a new "Claude" became `claude-2`).
Closed with four checks still to run, listed in
[manual tests](manual-tests.md) "D · Your agents": 1 (hidden for another
provider), 2 (the password form when the provider's session has ended), 9
(the card's states, the menu), 10 (phone, themes). A failure there reopens
D.
Deferred on purpose (27 Sep 2026): **the mini handshake**, the agent's
document naming its human back (e.g. `prov:actedOnBehalfOf`), so a
collective could check attribution before crediting you. D's agents live
on your pod, whose address already says whose they are, and nothing reads
the triple yet: a solid-kit ADR 006 follow-up once a reader checks
attribution. **Dates** are not kept on the card: only "last used", which
tells a forgotten connector; creation, revoke and delete dates belong to
an access log (Epic 9), if anywhere.

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

1. ~~Push solid-kit `f9ad05c`~~ (ADR 006 §5: `config.ttl` is public):
   pushed.
2. ~~Carry the general fixes back to solid-kit~~: `redirectUrlFrom`,
   `trackInputModality` and `.screen-wide` are in the kit. The tab bar
   that moves to the bottom on a phone stays here: the kit has no tabs.
   From D (27 Sep 2026): ADR 006 §2 notes the agent's back-link to its
   human as deferred (solid-kit `39e4836`, to push). D's agent code is
   provider-specific and stays in this repo.
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
   provider's host. The write logic is unchanged. **Closed on 27 Sep
   2026** after live use (see C, "Closed"). D followed and is closed
   (27 Sep 2026); People & apps left D (a later entry in Pods' side
   list). Next: E.
5. **Tabs, third pass** (26 Sep 2026, [layout-brief](layout-brief.md),
   canvas "Tabs (third pass)"): built the same day. Sign-in lands on Pods
   (Collectives while an invitation waits); two tabs, Pods and
   Collectives, one collective opened inside it; Home is gone, You sits
   under the avatar with `profile/card` shown read only. Used live with C.

In [journeys](journeys.md) terms: J1, J3 and J5's admin side are built;
J2, J4 and J6 work already; J7 is C; J8 (let an AI use a folder) is D,
built and run live.

## A — Member side of the handshake · built

For someone who already has an account. Name, agent, inbox, join, share. The
first live test is Neil's (see `manual-tests.md`, "Slice A").

Not in A, on purpose:

- **Creating an account.** Built later, as J1 (below).
- **The agent's profile pointing back at its human.** ADR 006 wants both sides.
  Still deferred after D (27 Sep 2026, see "Where we are"): a later stage,
  once something checks attribution.

## Decided since A was built

- **Sharing sets the folder's rules whole; stopping deletes them** (27 Sep
  2026, overrules A's first cut and the 26 Sep merge): Share writes
  `output-to/<collective>/.acl` as you (Control), your profile's
  `acl:delegates` (Can edit) and the collective's agent (Can read). Stop
  sharing deletes that `.acl`, so the folder inherits again: inheriting is
  the absence of rules, not something to restore. Both first give
  `output-to/` rules of its own (you, your agents) when it has none, so
  inheriting never means the pod root's public Read. `src/lib/sharing.ts`,
  pinned on CSS in `test/pods/member.test.ts`.

The design review (draft 2) changed three things in A before B starts:
account creation moves into the first journey (username, email, password;
our provider only), the home screen splits into "You run" and "You belong
to" (built), and the shared folder becomes `output-to/<collective>/` (built). Reasons:
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

## B — Admin side of the handshake · built, run live

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

## C — Places: your pod, and what you follow · built, run live, closed

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

**Closed (27 Sep 2026).** Found in live use and changed before closing:

- **Sharing** sets `output-to/<collective>/.acl` whole (you, your
  `acl:delegates` Can edit, the collective's agent Can read); stop sharing
  deletes it, so the folder inherits. Both first give `output-to/` rules of
  its own when it has none, so inheriting never reaches the pod root's
  public Read ([access rules](explanation/access-rules.md)). The merge of
  26 Sep had left your agent out and could leave "Only me".
- **Open links**: a pod address in a browser tab carries no sign-in, so
  the app gives `…/?open=<address>` (carried across sign-in like an
  invitation; Pods for your own pod, the followed view otherwise). Each
  item's `···` menu has "Link ⧉ · Raw ⧉" (the raw address for a program
  or a public file); the shared folder has an "Open folder" button.
- **The side list**: the Followed heading opens the list of all; "+ Add
  an address" opens it with its form; the note left.
- The invitation link is trimmed and copied whole; the drawer closes
  with ✕.

Closed after C (27 Sep 2026): **Stop sharing tells the collective.** It
revokes, then sends an `as:Undo` of the announcement (described in
place) to the collective's inbox; "Shares" follows the latest message per
member and folder (`announcedBy`, `src/lib/admin.ts`), so share, stop and
share again read right. Added to solid-kit ADR 006 §1 as step 5.
Left open, each written where it belongs: the pod's default application
(provider note, D), a rename telling the people it names through their
inbox ("Your inbox, later", D) and editing someone else's pod (J9). The
canvas shows all of it (27 Sep 2026, note "Closing C" on the Pods page).

## D — Provider layer, shown only on our provider

**D1 · Your agents · built and closed 27 Sep 2026**
([manual tests](manual-tests.md), "D · Your agents"). On You, for our
provider's WebIDs only: each agent (a linked WebID on your pod other than
yours) with its connector and the folders whose rules name it; New agent
→ Connect to AI → Choose folders in one drawer; `···` → revoke the
connector, let it act for you or not, delete. As built
(`src/lib/agents.ts`, `src/agents-view.ts`):

- The account session is the provider's cookie; when it has lapsed, your
  email and password open one (a token in memory only). The connector
  (`/onboard/`) reads the cookie alone, so the test copy needs pocpod0's
  `ONBOARD_CORS_ORIGINS` to list `https://test.nicolasdb.eu`.
- An agent is `profile/<name>#me` (`card` is never given: "Card" becomes
  `card-agent`), created in four writes, each undone on failure; on CSS
  with one root storage the link always asks for the ownership proof, as
  the pod test shows.
- What an agent reaches is read from your own pod's folders (four levels,
  200 folders at most, never single files), said under the list. Giving
  a folder that follows its parent copies the rules it follows and adds
  the agent, so nobody else gains or loses anything.
- Delete revokes, removes the grants found, the `acl:delegates` line,
  unlinks, then retires the document (no `solid:oidcIssuer`, a dated
  note); a new agent of that name gets `<name>-2`. Every step can run
  again after a failure.
- You's "Your agent" step is now "May act for you", and offers your
  agents that the profile does not name yet.
- Reworked the same day from the canvas (first and second passes, with
  the user's edits): You's head follows the board (path, name; the full
  WebID above the source; steps as "Name · value" with a Done / Optional
  / To do pill); New agent under the agents. **The card, second pass**,
  in the iceberg order: identity line (acts for you, the WebID from the
  pod; hidden on a phone), whether an AI can use it now
  (connected as its label, last used; revoked; not set up), what it
  reaches as a count only, a warning when connected to nothing, the
  drawer's steps while unfinished, and the next step as the one primary
  button. The folders themselves are one level down, in Choose folders,
  which marks `output-to/<collective>/` as shared. The `···` menu (Connect
  or Revoke, Choose folders, acts for you, Delete) closes on a click
  elsewhere or Escape.
- Found live and fixed: an agent whose connectors could not be read (the
  connector refusing the origin) had no Connect button, so leaving the
  drawer stranded it; Connect is now offered whenever no live connector
  is known, and a refused connector says why.
- As decided, only agents inside the signed-in pod are listed: a WebID
  that is a pod of its own (e.g. `nicolas_claude/`) is not, though "May
  act for you" still names it.

**Brief:** [layout-brief-d](layout-brief-d.md) (27 Sep 2026), the input
to D's design session: screens, states, data shapes, the account API as
CSS documents it, open questions and a proposed order (D1 agents and
"Let Claude use a folder" … D5 the access log). The access log waits on
the provider: Epic 9 (server-side capture) is backlog in pocpod0.

Suggesting agents: the "Your agent" step already offers a collective
account its own `hs:agent`; D adds the WebIDs linked to the account on our
provider, so nobody types an agent's WebID by hand.

The CSS account API beyond sign-up (J1 creates the account and the first
pod): more pods on the same account, mint a WebID for an agent
(the back-link to its human deferred, see "Where we are"), mint and revoke connectors. Then the
Epic 9 access-log viewer. Hidden when the signed-in WebID comes from another
provider, because none of it is Solid protocol.

Full WebIDs to copy belong here too: C shows addresses without your
provider's host (`…/neil/profile/card#me`, `src/ui/address.ts`), which is
enough to recognise someone but not to paste their WebID elsewhere
(decided 26 Sep 2026). Done on You: the full WebID is copied with a
click there.

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

**The pod's default application** (provider note, 27 Sep 2026). A raw
pod address opened in a browser shows CSS's "Not logged in" page, because
the sign-in lives in the app. CSS can send browsers asking for HTML to a
default app: pointed at the backoffice's `?open=<address>`, every pod link
would open signed in. Server configuration, ops not this repo; the
backoffice's own `?open=` links already work on any provider
([following](explanation/following.md#links-that-open-signed-in)).

**For pocpod0, later (not this repo; 27 Sep 2026).** The provider's
MCP connector uses claude.ai's "no authentication" type: the random slug
in its URL is the secret. claude.ai now also offers OAuth (DCR or CIMD)
and, in beta, a static credential in a request header set by an
organization Owner ([authentication](https://claude.com/docs/connectors/building/authentication)).
OAuth would give everyone one URL, each person signing in at
pod.nicolasdb.eu and picking a linked WebID, with no secret in a URL; the
connector must then refuse a person's own WebID, or Claude gets owner
access. A static credential is one key for a whole organization, so it
fits neither personal agents nor per-person identity. If OAuth lands, D's
step 2 becomes "add this URL, sign in, pick the agent"; creating agents
and choosing folders stay as they are
([brief](layout-brief-d.md#answers-27-sep-2026-drawn-on-the-canvas)).

**Your inbox, later (not scheduled).** The handshake lives in two files:
`org:memberOf` in your `profile/card`, `foaf:member` in the collective's
roster. The `as:Accept` / `as:Reject` / `as:Remove` a collective posts to
your inbox change nothing; nothing reads them today, and deleting one
changes no state. Two uses to come: show "Refused" from an `as:Reject`
(the roster cannot say it to someone it refused), and the inbox as mail
between members, since any signed-in WebID may append to it (a member
shares minutes that name you, gives you edit on them, and posts a note to
your inbox; your agent could do the same). A third (27 Sep 2026): a
rename or move in Pods tells the people it names (each WebID granted on
the item, never public Read, which names nobody) with an `as:Move` to
their inbox, so a followed address can follow along instead of breaking.

## E — The collective's graph · in progress

The pipeline of the "pod as blackboard" note (pull → confront → flag →
chantier → publish), with its must-have first: **pull → confront → ingest
into Oxigraph → a member's agent draws on it**. HyperScope's pod is the
proof. Most of the work is in pocpod0 (connector, Oxigraph) and solid-kit
(the procedures, ADR 006); this repo holds the membership side of it.

The scenario it must pass: Xavier's agent writes his summary to
`output-to/hyperscope/`; the collective's agent pulls, confronts and ingests
it; Nicolas opens a new conversation with his own agent, which finds
Xavier's work through `graph_query`, reads it on the pod, and writes a new
contribution citing it (`prov:wasDerivedFrom`) that goes round again.
Later: the agent queries the graph on its own at a session's edges, 2 or 3
suggestions, naming the author.

Decided (29 Sep 2026):

- **One Oxigraph, one named graph per document**, named by its pod address;
  a collective is every graph under its pod. Isolation is the connector's
  job, since Oxigraph has none: the SPARQL protocol dataset holds against
  `FROM`, `FROM NAMED` and `GRAPH <iri>`, `SERVICE` escapes it, so the
  query is parsed, `SERVICE` and updates refused, and the regenerated text
  sent (pocpod0 `mcp-connector/src/collectiveGraph.js`). Oxigraph's port is
  loopback only.
- **Members' agents query too, read-only, acting as their member**: on the
  roster, or declared by someone on it (`acl:delegates`), and only over
  folders they can read on the pod. So accepting grants the member's
  agents the same Read (`src/lib/admin.ts`, `readersOf`), and the members
  table says what a member or their agents cannot read yet.
- **Triggers**: by hand first ("lance le pull" in the collective agent's
  session), then polling, then the webhook (ADR 006 §4).
- **Skills as IPO modules**: each procedure names its input folder, its
  output folder and is the only writer there. Pull and confrontation exist
  (solid-kit `docs/procedures/`); ingest is a tool; the member's procedure
  (what to put in `output-to/`, how to cite) is to write.

Steps: (1) connector tools, **done, deployed**; (2) agents granted on
accept, **built**, live check in [manual tests](manual-tests.md) "E";
(3) confrontation v2 writes a Turtle sidecar (topics, cites, verdict) next
to each snapshot, and a member procedure, **written** (solid-kit `f8a0b90`,
every query checked on Oxigraph; not yet run by an agent); (4) Xavier onboarded through the
backoffice, then the loop by hand, then with HyperScope's members.

Not in E, on purpose: **admin rotation** (today "the collective you run" is
the account signed in; rotating means admins by WebID in `config.ttl`, not
blocking yet) and **creating a collective** from the app (a recipe not
settled: pod, `inbox/`, agent, `config.ttl`, `membres.ttl`, procedures,
required profile fields, members-only documents such as a machines list;
maybe a script or its own app, with the collective's own landing page).

## F — Maps of Making landing

The same app with a second `config.ttl` and its own entry page. If that needs
more than a config line and copy, the backoffice is not generic enough yet, and
that is the finding.

## G — Share the folder you choose · built, run live, closed (16 Oct 2026)

Why: Xavier's first try (E step 4). How sharing works was confusing, and
`output-to/` means nothing to a member. The member should pick the folder they
share, from the collective's panel.

Decided (16 Oct 2026):

- **The member picks the folder.** `hs:bundleFolder` becomes the picker's
  suggestion, not a rule. Rename the example away from `output-to/`.
  Root, `profile/`, `settings/` and `inbox/` are never offered
  (`PROTECTED` in `src/lib/move.ts`).
- **The choice lives in `settings/collectives.ttl`** on the member's pod,
  one entry per collective (collective IRI → folder), like
  `settings/following.ttl`. Not the profile (public). The Type Index was
  considered and set aside: the custom file is simpler. The member's
  agents (`acl:delegates`) get Read on it so they know where to write.
- **`settings/README.md`**: written by the backoffice the first time it
  writes in `settings/`, if missing. It says what the folder is for (apps
  keep your settings there), and that changing or deleting files there can
  break apps. It inherits its rules.
- **Sharing adds or removes one WebID**, merged into the folder's rules,
  the same as the access panel. This replaces `src/lib/sharing.ts`'s
  write-whole / delete-`.acl`. A folder without its own rules gets a copy
  of what it inherited, plus the agent's Read (`acl:default`, so it
  covers what is inside). Stopping removes that agent only, so a folder
  shared with two collectives stays shared with the other one. When what
  is left equals what it would inherit, offer **Reset to inherit**: confirm
  first, and show what it will then inherit (it may be public).
  *Changed after the live check (16 Oct 2026):* Stop sharing always asks
  what the rules become: keep the rest (default), follow the folder
  above, or only you and your agents, each in words.
  `secureParent` goes: the parent of a picked folder is the member's.
- **Your agents Can edit the shared folder**: kept, shown as a line
  ("your agent can deliver here"), not as a side effect.
- **Agents get no default grant.** The agent folder picker suggests folders
  (the shared ones first) and says why each one would be needed. Today it
  explains nothing. Every grant screen answers the
  [four questions](explanation/four-questions.md): who, what, why, what if
  not.
- **Iceberg**: the member never sees `.acl` or Turtle on the visible part.
  The technical rules stay below, as in Pods.
- **`procedure-contribution`** (solid-kit): the member's agent reads its
  folder from `settings/collectives.ttl`, falling back to `hs:bundleFolder`.
  While HyperScope is the only collective, procedures change directly.

Edges:

- Moving or renaming a shared folder (`move.ts`) sends an Undo for the old
  URL and an Announce for the new one, and updates `settings/collectives.ttl`.
- Changing folder works the same way: Undo, then Announce.
- A public folder: say the collective could already read it.
- Items inside with their own rules don't inherit the Read: count them and
  say the collective can't read them.
- A share inside another shared folder: show it.
- `src/agents-view.ts` stops matching `^output-to/` and reads the settings
  file instead.

Done (PRs #1, #2, #3, and `f271158` pushed to `dev` directly by mistake),
run live on HyperScope by Nicolas, 16 Oct 2026:

- Picker, `settings/collectives.ttl` (own rules: you, your agents Read)
  and `settings/README.md`; share merges into the folder's rules;
  announce reaches the collective ("Shares" shows `shared/MoM/`).
- **Stop sharing asks** what the rules become: keep the rest (default),
  follow the folder above, only you and your agents, each in words.
  Replaced the conditional "Reset to inherit" button, which stayed hidden
  too often. Stopping forgets the folder in the settings file.
- **Shared means the agent is named**, not "anyone can read": a public
  folder stayed "Shared" after stopping, and the picker never came back.
- **Security fix found on the way**: copying an inheriting item's rules
  took the pod root's public Read (no `acl:default` on CSS) and wrote it
  with `acl:default`, making the item public. Sharing (G), an agent's
  folder (D) and the access panel leaving Inherit (C2) all did it.
  `parseAcl` now records `inherits`; copies start from `followedBy`.
  Folders shared or granted before 16 Oct may be public: check them.

Left over, carried to "Where we are": moving a shared folder
re-announces; suggestions and reasons (four questions) in the agent
folder picker, with `agents-view.ts`'s `^output-to/` note; the count of
items with rules of their own; `procedure-contribution` reads the
settings file (solid-kit); a base `select` style in the kit.

## H — Mermaid in the Markdown preview · built (17 Oct 2026)

Why: the cross-project plan (`hyperscope_ndb/tasks/now.md`) is a Mermaid
flowchart: projects as subgraphs, arrows for what blocks what, green for
free to start. Read as source it does not show what to pick next.

Built:

- ```` ```mermaid ```` blocks become diagrams in Pods' preview and the
  editor's preview (`src/ui/mermaid.ts`). Other formats are unchanged:
  Turtle and plain text as source, JSON indented.
- Mermaid loads only on a page that holds a diagram (its own chunks, the
  main bundle unchanged).
- Safety: `securityLevel: "strict"` (labels encoded, no clicks, not
  overridable from `%%{init}%%`), labels as SVG text (no
  `foreignObject`), and the SVG goes through DOMPurify's SVG profile.
- Drawn on a light card in both themes, because a `classDef`'s colours
  assume a light ground. Shown at its own size, scrolled; **Fit width**
  (kept across redraws) and **Full screen** (the Fullscreen API, or a
  layer over the app where there is none; the page is not redrawn under
  it). Full screen pans and zooms: drag, wheel, pinch, −/Reset/+. A diagram that does not parse stays as source with the reason
  above it.
- Bonus: `.toml` previews and edits as text (CSS serves it as
  `application/toml`, which is not `text/*`).
- Drawn SVG kept by source (50 at most), forgotten at sign-out.

Run live: [manual tests, H](manual-tests.md#h--mermaid-in-the-markdown-preview).
Mermaid 12 pulls KaTeX, which `npm audit` flags (prototype pollution,
moderate); math in labels is not used, an override waits for a fixed
release.

## I — Documents in Pods: Word, then PDF · built (17 Oct 2026)

Built and run live 17 Oct ([manual test I](manual-tests.md#i--word-files-in-pods)):
`src/lib/word.ts` (mammoth 1.13 + Turndown 7.2 and its GFM tables, loaded
on demand), `src/ui/pictures.ts`, Pods (`src/places.ts`). Differences
from the plan below:

- The copy of a `.docx` already on the pod is a button on the file's page
  ("Make a Markdown copy", beside Download), not in the `···` menu: the
  page already holds the bytes.
- Copies list items as `- item` (Turndown writes `-   item`), take a
  table's first row as its header (Word rarely marks one; Markdown needs
  one), and keep only the words of a `javascript:` link.
- **Images beside a note now show in every Markdown preview** (needed for
  "Markdown only"): a relative image is read from the pod with the
  member's WebID, same server only. It also fixes notes written by hand
  or by the `gdoc-to-solid-md` skill.
- One choice per upload covers every Word file picked with it.
- I4 came with J.
- `npm audit` flags `sprintf-js` (moderate, a denial of service), pulled
  by mammoth's command line through `argparse`; the browser build never
  loads it.

Why: members arrive with `.docx` (Xavier's share), and Google Docs export
to it. Keep or convert, and why no option is closed:
[Documents on a pod](explanation/documents.md).

The rule: the original is never replaced; a conversion is a copy beside
it, with `source`, `converted` and `converter` in its YAML header.

- **I1 · Preview.** A `.docx` in Pods (by type or extension) shows as a
  page: mammoth to HTML in the browser, through the same sanitizing as
  Markdown, loaded only when a Word file is opened. Read only.
- **I2 · Convert, the member's choice.** Uploading a `.docx` asks: keep
  the Word file (default), keep it and add a Markdown copy, or Markdown
  only (images beside it; the `.docx` stays on the member's computer).
  The same copy from the `···` menu of a `.docx` already on the pod.
  Writes `<name>.md` and its images (`<name>-images/`), the header naming
  the original. Converter taken from
  [obsidian-docx-importer](https://github.com/mayac5/obsidian-docx-importer)'s
  `src/converter.ts` (MIT, notice kept), without its wikilink step.
  Refused, not overwritten, when the copy's name exists.
- **I3 · The preview says where a copy came from**: "Converted from
  rapport.docx on 17 Oct", for I2's copies and the `gdoc-to-solid-md`
  skill's (its `source:` is a Google Docs URL).
- **I4 · PDF preview**: the browser's own viewer on the file's bytes, no
  library. No conversion in the browser: the conversion is docling's, on
  the server (pipeline B), for precision:
  [PDF](explanation/documents.md#pdf-a-light-preview-docling-for-the-conversion).
- **Upload progress**, asked and built 17 Oct: ten cells, the percentage
  and `34M/90M` for the file being sent (a batch keeps "2 of 3" above).
  Byte progress needs `XMLHttpRequest` (Firefox cannot stream a request
  body to `fetch`), which the session's `fetch` cannot sign; so
  `src/lib/upload.ts` has the session sign a bodiless copy of the request,
  catches its headers on the way to the global `fetch`, and sends the file
  once by XHR with them. Pinned on the real Inrupt library
  (`upload.test.ts`); any doubt (headers not caught, 401/403) sends it
  through the session's `fetch` as before, without progress.
- Later, not planned: "Download as Word" for a Markdown file (the
  plugin's exporter, on the `docx` library); `.odt`. Known unknowns:
  [Documents on a pod](explanation/documents.md#known-unknowns).

Depends on: nothing outside this repo. Related, elsewhere (decided 17 Oct,
[why](explanation/documents.md#on-the-collectives-pod-markdown-and-images-the-docx-dropped)):
pipeline B (solid-css-overlay) pulls a shared `.docx`, converts it with
pandoc to Markdown and images, checks the conversion in code, and drops
its `.docx` only when complete; solid-kit ADR 006 to amend (pull rule 5).
The share summary (pipeline D) counts `.docx` among the types.

## J — Media in Pods: images, audio, video · built (17 Oct 2026)

Run live 17 Oct: PDF, `.docx` (preview and copy with images), an `.m4a`
play; `.odt` uploads with no preview, as planned. A 35 MB `.mp4` (H.264
High + AAC, the usual web video) failed in Fedora's Firefox as "the file
is corrupt": that Firefox decodes video through the system's
`libavcodec-free`, which has no H.264 (RPM Fusion's
`libavcodec-freeworld` adds it). The same link plays in Chrome and
Brave (checked 17 Oct). Not the pod,
not the app; the preview now says "This browser cannot play …" with
Download. Upload progress (asked 17 Oct): in I's "Later" list above.

Status, 17 Oct 2026 (read from the code; the PNG checked live):

- **Upload** sends any file as is, one PUT per file, typed by the browser
  (`file.type`, else `typeFor`). The gateway in front of
  pod.nicolasdb.eu takes **100 MB per file** (`client_max_body_size`,
  hetzner-gateway `04-pocpod0.conf`); past that the upload fails as "Could
  not create … (413)", with no word on why.
- **Images preview** as `<img>` from the bytes read: PNG (a 5 MB one
  checked live), JPEG, WebP, GIF and AVIF show in every current browser.
  HEIC (iPhone photos) shows in Safari only, a broken image elsewhere;
  Safari on an iPhone usually sends a JPEG when uploading from Photos.
  SVG is left out on purpose: no preview.
- **Audio and video** upload (under 100 MB) and download; no preview.
- **Opening any file reads it whole**, even one with no preview: a 90 MB
  video is downloaded into memory to say "No preview".

Plan, smallest first:

- **J1 · Say the limit before sending**: a file over the limit is refused
  in the browser with the reason; a 413 says "too large for this pod
  (100 MB per file)". With the 1 Oct follow-up: after a failed upload,
  check what was stored.
- **J2 · Don't read what cannot be shown**: a file with no preview, or a
  preview over a size (say 20 MB), shows its type and size from the
  listing, with Download and "Show anyway".
- **J3 · SVG** as `<img>` (scripts in an SVG do not run there); never
  inlined.
- **J4 · Audio and video** with the browser's own player, from the bytes
  read (under J2's size); a public file plays from its address, which can
  stream.

Built 17 Oct (`src/lib/files.ts`, `src/places.ts`; `npm run test:pods`
confirms CSS 7 sends `Content-Length`):

- J1: `UPLOAD_LIMITS` in `src/config.ts` (100 MB for pod.nicolasdb.eu)
  refuses a larger file before sending; a 413 from any server says "larger
  than this pod accepts"; after a failed upload, a `HEAD` says when only
  part of the file was stored.
- J2: `readFile` reads the headers first and stops there for a type with
  no preview, a text over 1 MB or a medium over 20 MB
  (`MEDIA_PREVIEW_LIMIT`): type and size, Download, and for media "Show
  anyway". Download reads the file whole.
- J3: SVG as an `<img>` (kind `svg`). PDF in the browser's own viewer
  (I4's preview, here because it cost one line).
- J4: `<audio>` / `<video>` from the bytes; over 20 MB, "Show anyway"
  plays a public file from its address (an unauthenticated `HEAD` says
  whether it is public) and reads a private one whole. A playing medium
  is never redrawn under the listener.

Known unknowns: whether CSS 7 answers `Range` requests (streaming a
private file needs it, and a way to sign the media element's requests);
the per-file limit after the move to the overlay image; a quota per pod;
what the collective's pipeline does with audio and video (a transcript,
as text, is a path: `~/github/audioTranscript`).

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
