# Manual test suite

**A kit version is not validated until this has been run against a live
provider.** The automated checks (`npm run verify`) cover the logic and the
design tokens. They do not cover sign-in, and must never be read as if they did:
OIDC needs a browser, a real provider and real credentials, so it is verified by
hand or not at all.

Run this after `npm run dev`, on your own machine, before adopting a kit version
for a new app.

---

## Run record

Copy this block into the repo (or the app's own README) when you complete a run.
A finished run is what backs the claim that the kit works.

```
kit version : 0.1.0
provider    : https://pod.nicolasdb.eu/
browser     : 
date        : 
result      : 
```

A step that fails is a finding to write down, not something to retry until it
passes quietly. "The provider did not prompt for consent" is useful; a blank is
not.

---

## Before you start

```bash
npm install
npm run verify     # typecheck + tests + design audit — all must pass
npm run dev
```

If `npm run verify` fails, stop. There is no point testing sign-in against a kit
that does not pass its own checks.

---

## 1 · The app loads

**Do:** open the dev server URL.

**Expect:** the sign-in screen, styled — heading, explanatory line, a labelled
field prefilled with `DEFAULT_IDENTIFIER`, one primary button. No unstyled flash
before the CSS lands.

**Observed:**

---

## 2 · Sign in with a pod address

**Do:** leave the prefilled issuer URL (`https://pod.nicolasdb.eu/`) and submit.

**Expect:** the button shows "Redirecting…", then the provider's own login page
appears. Sign in, consent. You land back on the app, which shows your WebID and
the discovered pod root.

This exercises `isOidcIssuer` — the `.well-known/openid-configuration` probe
succeeds and the address is used as the issuer directly, with no profile read.

**Observed:**

---

## 3 · Sign in with a WebID

**Do:** sign out. Enter your WebID (`…/profile/card#me`) and submit.

**Expect:** the same end state, reached differently — an identifier containing
`#` skips the probe entirely and goes to `discoverOidcIssuer`, which reads the
profile document for `solid:oidcIssuer`.

Both paths must work. This is the one that breaks when a profile is served
without the right content type.

**Observed:**

---

## 4 · The session survives a reload

**Do:** while signed in, reload the page.

**Expect:** still signed in, no redirect. `restorePreviousSession` did its job.

**Observed:**

---

## 5 · Session ids do not collide

**Do:** serve a second copy of the kit on a different port with a *different*
`SESSION_ID` in `src/config.ts`. Sign in to both.

**Expect:** both stay signed in independently.

Then set them to the *same* `SESSION_ID` and repeat.

**Expect:** they interfere — this is the failure that forced valisette and the
backoffice onto separate subdomains, and reproducing it once is worth more than
reading the comment about it. Set the ids back to distinct values afterwards.

**Observed:**

---

## 6 · Pod discovery without `pim:storage`

**Do:** sign in with a WebID whose profile has no `pim:storage` triple (an older
pod, or one edited to remove it).

**Expect:** the pod root is still found, via the Link-header walk — **and it is
the user's pod, not the server root.** On a multi-pod server the root advertises
`pim:Storage` too, so a walk that does not stop at the first match silently
returns something unwritable.

**Observed:**

---

## 7 · An expired session reports itself

**Do:** sign in, then invalidate the session (revoke the app in the provider's
UI, or leave it until the token expires) and trigger a pod read.

**Expect:** "the session has expired…" naming the resource — not a raw 401, and
not the server's error graph.

On a private pod an expired token makes *everything* answer 401, existence
probes included, so this is the message that decides whether the next failure is
diagnosable.

**Observed:**

---

## 8 · An unreachable provider says so

**Do:** enter an address that does not resolve, or disconnect and submit.

**Expect:** a message naming the address and suggesting what to check — not
"Failed to fetch".

**Observed:**

---

## 9 · The design system, both themes

**Do:** open `/styleguide.html`. Use the Light / Dark / System switch, and change
the OS appearance while on "System".

**Expect:** every contrast badge reads AA. Nothing unreadable in either theme —
particularly no token that renders one theme's text on the other theme's ground,
which is what a slot defined in only one mode looks like.

**Observed:**

---

## 10 · Mobile layout

**Do:** open the app on a real phone with a notch — a simulator will not do,
because `env(safe-area-inset-*)` resolves to zero in most of them.

**Expect:** content clears the notch and the gesture bar. Rotate, and scroll to
the bottom: nothing sits under a browser bar, because the layout uses `dvh`
rather than `vh`.

**Observed:**

---

## UX review

Not machine-checkable. Answer these per release, about whatever screens the app
has grown — the kit's own shell is small enough that most only become real once
an app is built on it.

- Does every step present **at most four** things to hold at once?
- Does every screen have exactly **one** primary action, visually distinct?
- Is the friendly view the default, with the technical one available on demand
  rather than always shown?
- Is progress through anything multi-step **visible**, and grouped into a few
  phases rather than counted in steps?
- Does every mutating action offer an **undo**?
- Does the closing screen **restate the model** rather than just confirming?
- Is any state indicated by **color alone**?
- Does the copy name things as a person would recognize them — a pod, a name on
  the web, who can see what — rather than as the system is built?

Error states carry their own questions, because `renderError` can enforce that
there *is* a way forward but not that the way forward is any good:

- Does every error say **what happened**, **which resource refused**, and **what
  to do next** — and is the "what to do next" something the person can actually
  do from where they are standing?
- Does the copy avoid implying the failure was **their mistake**? An expired
  token, a provider down and a moved pod are all the system's doing.
- Does it say what happened to **their work**? "Nothing was lost" is the
  sentence people are actually looking for, and it must be true when written.
- Is the raw failure available on demand and **not** on the screen by default?

And two from the laws the kit follows without a machine check
([`ux-principles.md`](ux-principles.md)):

- Can someone who **skipped every explanation** still use the app? The paradox
  of the active user says most people will, whatever the onboarding does.
- Does the sign-in field accept the address in whatever shape the person has it
  — WebID, pod URL, with or without a trailing slash?

See [`ux-principles.md`](ux-principles.md) for where these come from.

---

## Slices A and B — the handshake, on the live pod

The protocol is tested against a throwaway CSS 7 with a cast of accounts
(`npm run test:pods`: `member.test.ts`, `admin.test.ts`, `cast.test.ts`), and
the screens against mocks (`src/admin.test.ts`, `src/onboarding.test.ts`). Those
cover name, agent, inbox, join, share, stop sharing, leave, accept, refuse (with
`as:Reject` reaching an inbox), members from both sides, remove, and messages
the app does not understand. **They do not cover a real browser sign-in, the
live pod's own setup, the agent, or whether the copy reads well.** This pass
covers only those. It is short on purpose: a step that a test already runs is
not repeated here.

Use two test accounts on the live pod: one **not** yet a member (Neil's), and
the collective's own. Before starting, the collective's pod is set up as in
[how-to/set-up-a-collective.md](how-to/set-up-a-collective.md), steps 1–6, and
`membres.ttl` has its own `.acl`; if `depots/` or `principles/` exist, they
need one too, or accepting is refused before any write.

1. **Newcomer, in a browser.** Open
   `/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl` and sign in as
   the test account. Go through name, inbox, join and share on the screen.
   Read every line: is anything wrong, unclear, or blaming the person? Finished
   steps fold to their title.
2. **Collective, in a browser.** Sign in as the collective's account. "You run
   HyperScope" shows the request with the requester's own declarations and a
   suggested short name. Accept it. `membres.ttl` keeps its hand-written
   comments, and the new lines look right to a person reading the file.
3. **Live ACLs.** As the newcomer, reload: "You are a member". If it stays
   "pending", the live `membres.ttl.acl` did not take the grant. That is a
   finding about the live pod, which the throwaway server cannot show.
4. **The agent.** With the folder shared, run the pull procedure: the file is
   picked up. This is the collective's agent, not this app.
5. **Refuse and remove, once each.** Refuse a second request; remove the
   member. "Remove" asks once more. Read the wording of both.
6. **A message it does not understand.** POST a plain-text body to
   `hyperscope/inbox/`. It shows under "Other messages" and can be deleted.

Write down anything the copy got wrong, not just what failed.

### Layout pass — layout A, on a desktop and a real phone

Built in slices (docs/slices.md, "Layout pass"); run each part as it lands.

1. **L1, tabs.** As `nicolasdb`: Home, HyperScope and Places (shown as
   coming, not clickable). HyperScope's tab has the folder and Leave;
   Home has no Share button. The back button returns to the previous tab;
   a reload keeps it. As `hyperscope-HQ`: HyperScope's tab is the
   collective you run. On a phone with a notch, the tabs sit at the bottom,
   clear of the gesture bar; nothing hides under it when scrolled to the
   end. Tab through with the keyboard: every tab is reachable, Places is
   skipped. Both themes.
   **Run 26 Sep 2026** on test.nicolasdb.eu, desktop and phone: tabs fine;
   the bar stays at the bottom on both tabs (after long addresses were made
   to wrap); signing in from a tab works (no fragment in the redirect URL).
2. **L2, the collective's own screen.** As `hyperscope-HQ`, HyperScope's
   tab: the name, the counts and the invitation link, which copies itself
   when clicked (on test.nicolasdb.eu; on localhost the address instead).
   Paste the copied link in a private window: it opens the invited welcome.
   Paste it, signed in as another account, into "Join another collective":
   the collective's card appears. Desktop: requests left,
   members right as a table; "Find a member" narrows it by name, short name
   or address. Phone: "Requests · Members · Other" chips scroll to each
   section without changing the address; each member is a block. Home keeps
   only the summary card. Then run steps 3, 5 and 6 of slices A and B above
   on this screen.
   **Run 26 Sep 2026**, desktop: layout fine; the filter matched every row
   (all members share the host) and now searches name, short name and path.
   The header offered the config.ttl address "to give people"; it now gives
   the invitation link, the one thing an owner sends.
3. **Theme switch.** The icon left of the avatar (and in the
   landing's nav) goes light (the default) → dark → same-as-device. The choice survives
   a reload; in a private window it lasts until the reload. Both themes read
   well on every tab.
4. **L3, the landing.** Signed out, in a private window, desktop and phone
   (links as in [invite people](how-to/invite-people.md)): `/` shows the backoffice's own page (sign in first, "Create one on
   pod.nicolasdb.eu" one click away; "How it works" scrolls without changing
   the address). `/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl`
   shows the invited page: HyperScope's card, its folder in step 03, the
   create form first. Add `schema:slogan "…"` to HyperScope's `config.ttl`,
   reload: its text replaces "Your work stays yours."; remove it again. Titles are in Newsreader
   (serif), not Georgia. Both themes.
5. **L4, a member's tab.** As `nicolasdb`, HyperScope's tab: beside Sharing
   and Your membership, "Members" lists the roster (nicolasdb marked
   "(you)", each with a short name) and "Its agent" shows the agent's WebID.
   "Your membership" says which short name the roster gives you. As a
   `test-` account that has asked but is not accepted yet: "Members" says it
   opens once HyperScope accepts you, and nothing says "refused".
   Paste HyperScope's invitation link into "Join another collective" as
   `nicolasdb`: "You already belong to HyperScope." (as `hyperscope-HQ`:
   "You run HyperScope").

**Run record, 26 Sep 2026.** Steps 1–5 run live on test.nicolasdb.eu,
desktop and phone, both themes, including the pending A/B steps 3, 5 and 6.

### J1 — a new account from an invitation (the end-to-end run)

This is also where steps 1, 3, 5 and 6 above get run: the new account is
the non-member they need. Use a private window, and a username starting with
`test-`: CSS 7 cannot delete an account through its API, so it stays.

1. Open `/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl`. The
   first screen says you are invited and offers "Create an account"; "I
   already have a Solid account" is one click away.
2. Type a name: the username follows it, and the pod's address under it
   changes. Create the account. Try a taken username once (`hyperscope`):
   the error sits on the username field, and the retry keeps the email.
3. The provider's page asks you to sign in. **Spike:** does it ask for the
   password, or only for consent? The app sends `credentials: "include"` when
   creating the account, in case CSS sets its sign-in cookie. Write down which.
   If only consent, drop the "asks for this email and passphrase once" line
   from `src/signup.ts`.
4. Back on the home screen: your name is the heading, "Your inbox" is done,
   and HyperScope offers "Ask to join" as the next action. Nothing asked you
   for either.
5. Ask to join, then run steps 1, 3, 5, 6 above with this account.
6. **Forgot password.** The provider advertises a reset
   (`/.account/login/password/forgot/`). Ask for one with the test
   account's email: does a mail arrive? Write down which. If it does, the
   line under "Create my account" in `src/signup.ts` can say how to reset;
   if not, it only says to keep the passphrase safe.

**Run record, 25 Sep 2026.** Done live: 2 (accept, request sent from a
personal account), 4 (pull and confrontation).

**J1 run, 25 Sep 2026** (`audit: 23 checks passed`; account `test-easy`).
1–2: invitation screen as described; `hyperscope` refused as taken, a
second username accepted on the same account. 3: the provider's page asks
for the password, then consent: the `credentials: "include"` spike does not
spare the password, so the line in `src/signup.ts` stays. 4: name and inbox
done, "Ask to join" is the next action. 5: asked to join, shared
`output2/hyperscope/`, accepted by the collective ("Member: both sides
agree", the share announced). Slices A and B step 1 is done by this run.
6: the provider's reset is disabled, SMTP is not set on the provider:
deferred, not blocking; the sign-up line now only says to keep the
passphrase safe. Still to run: A and B steps 3 (the newcomer's own "You are
a member" after reload), 5 and 6.

## L5 · speed, on the live pod

`test/pods/speed.test.ts` counts the requests one `load()` makes and adds
latency to each; with 300 ms per request, a member's home went from 2555 to
1737 ms and the collective's from 3749 to 1536 ms, and a second load gets 304
for what did not change. **It cannot show a real network, the provider's
CORS, or how the tabs feel.** This pass covers only those. Open the
browser's developer tools on the Network tab, filtered to the pod's host.

1. Sign in and wait for Home. Click a collective's tab, then Home again.
   Each tab appears at once, with no "Reading your profile…" line; the reads
   show up in the Network tab after it.
2. On the second visit to a tab, the profile, `config.ttl` and
   `membres.ttl` answer **304**. If a read fails with a CORS error naming
   `If-None-Match`, write it down: the app then asks again without it, so
   the screens still work, but the provider's CORS needs the header allowed.
3. In a second browser window, change your name on the pod (or ask to join
   from another account). Switch tabs in the first window: the change
   appears a moment after the tab, without a reload.
4. Start typing in "Join a collective", then switch tabs and come back while
   something changed on the pod: nothing you typed on the current screen is
   ever wiped by a redraw.
5. Sign out, sign in as another account: nothing from the first account
   shows, even for a moment.

**Run record, 26 Sep 2026** (test.nicolasdb.eu, `dev` at `1069a19`): 1
passes: faster on the first load, each tab appears at once. 2–5 deferred
(not run yet): the 304s and the provider's CORS for `If-None-Match`, a
change from another window, typing kept, and switching accounts.

---

## C · Pods, on the live pod

Written as each of C1–C6 is built; **run together once C is complete**
(decided 26 Sep 2026). `npm run test:pods` covers the reads and writes on
CSS 7 and `src/places.test.ts` the screen; this pass covers what they cannot:
the provider, a real browser, a phone, both themes.

### C1 · Browse your pod

1. Open **Pods**. "My pod" is current in the side list, named by the end
   of its address (`…/<your pod>/`); no panel is open. The root's folders
   come first, then files, newest change first: Name, Size (a folder's
   count fills in as it is read), Last modified.
2. Click each column heading: the list sorts by it, folders still first;
   a second click turns the order around. **Columns ▾**: hide Size, show
   Type, move it with ↑ / ↓. Reload: the columns are as you left them.
   Show **Who can access it**: each row fills in after the list; the list
   never waits for it.
3. Open a folder, then go back with the browser's Back button: the folder
   seen before appears at once. On the Network tab, its listing answers
   **304**, and drawing the list sends no `.acl` request.
4. Open a Markdown file: it shows full width as a page (Preview), with no
   side list. Open a JSON file (indented), an image, and a file with no
   preview: Download saves it with its name.
5. `···` on a row: a menu under it (above it on the last rows) with its
   name, Rename, Move and Delete, then who can access it as chips (a name
   each, what they can do on hover; can edit has a green edge). Hovering
   "Who can access it" says where the rules come from ("Its own rules" / "Same as
   projects/"). While the rules are read, nothing in the menu moves. Move's
   list of folders reads in both themes. Escape closes it and focus
   returns to `···`. On a phone (≤ 40rem): the pod picker
   replaces the side list, rows are blocks, and the menu opens as a sheet.
6. Both themes: nothing unreadable in the table, the menu, the drawer or a
   preview.

### C2 · Who can access it

1. `···` on a folder with rules of its own, **Change who can access it**:
   a drawer opens from the right with Only me / Inherit from parent /
   Anyone with the link / Named people, as they are on the pod. Save and
   Cancel stay disabled until you change something. The same drawer opens
   for a file.
2. Add a person by WebID, set them to **Can read**, Save. In a private
   window signed in as that person, the item opens; before, it did not.
   Switch them to **Can edit**, Save: the technical rules show Read,
   Append, Write, and never Control for them. WebIDs on your provider show
   without its host (`…/neil/profile/card#me`).
3. A chip "Fill in from <collective>'s members" adds one person; the
   technical rules name their WebID, never the collective.
4. As the collective, remove a member (B), then open an item they were
   granted on your pod: "Left <collective>. Still has access until
   removed."
5. Pick a file that follows its folder: **Inherit from parent** is chosen,
   with "Same as <folder>: …" and a button to open the folder's access.
   Choose Anyone with the link: it says the file stops following its
   folder; Save: it opens in a private window without signing in. Choose
   **Inherit from parent** again: it says its own rules will be removed;
   Save: it follows the folder again and the private window gets 401.
6. Open the drawer in two windows, save in one, then save in the other:
   nothing is written, a message says the rules changed, and the drawer
   shows them as they are now.
7. The pod root (`···` beside the path) offers no Inherit. "Technical
   rules" at the bottom of the drawer opens the raw `.acl`, read only.

### C3 · Write files

1. In a folder: **New folder**, a name with a slash is refused in place;
   a new name appears in the list. The same name again: "already there".
2. **New file** `plan.md`: it opens in the editor, side by side on a
   desktop (the source alone on a phone), with its title filled in.
3. Type: "Unsaved changes" shows and Save turns on; the preview follows a
   moment later. Save (or Ctrl/⌘+S): "Saved", the pill goes away.
4. Open the same file in a second window, save there, then save here:
   nothing is written, a notice says someone changed it, your text stays.
   "Save mine over theirs" writes yours; "Replace my text with theirs"
   shows theirs.
5. Type without saving, click Home, come back to the file: your text is
   still there. Close: it asks before discarding.
6. **Upload** two files, one with a name already in the folder: one is
   uploaded, the other refused by name; nothing is replaced.
7. Markdown with a `<script>` or a `javascript:` link: the preview shows no
   such link and runs nothing.

### C4 · Rename, move, delete

1. Make a folder `tmp/` with two files and a subfolder that has rules of
   its own (share it with someone in C2). **Rename** `tmp/` to `tmp2/`:
   the menu shows "Copying… Checking the copy… Removing the old place…";
   `tmp2/` holds everything, and the subfolder's menu still says "Its own
   rules". The
   person it was shared with still opens it at the new address.
2. **Move** a file to another folder: only folders you have opened are
   offered; the item, its own folder and anything inside it are not.
3. **Delete** `tmp2/`: it says how many items are inside before anything
   happens; after, the folder is gone.
4. `profile/`, `inbox/`, `settings/` and the pod itself offer no Rename,
   Move or Delete, and say why.
5. Close the tab in the middle of moving a large folder, reopen: the
   original is whole (a copy may be left beside it; nothing is lost).

### C5 · Following

1. **Pods → Follow an address**, paste an address you cannot read: it is
   refused and nothing is kept. Paste one shared with you: it appears in
   the list and in the side list (the phone's place picker).
2. With the Network tab open, go to **Followed**: the only request is
   `settings/following.ttl` on your own pod.
3. Open the followed folder: **Read only**, the note about their access
   log, no New / Upload / Rename. Open a file inside: its preview, and
   Download.
4. Ask its owner to remove your access, then open it: "This cannot be read
   now"; the list says "Not readable since …" and keeps it.
5. **Favourite**, then sort by "Favourites first". **Unfollow**, then Undo
   from the message: it is back.
6. In a private window as someone else, `settings/following.ttl` answers
   403 (or 401 signed out).

### C6 · Technical rules, advanced mode

1. On a desktop, open the drawer of a folder with rules of its own, open
   "Technical rules" at its bottom, **Edit these rules**. Change a
   person's modes to `acl:Read, acl:Append`: "What changes" says "<name>: can read becomes
   read and add" (or "can edit becomes …").
2. Tap Save once: nothing is written; the button reads "Save anyway: I
   checked these rules". Wait ten seconds: it goes back to Save. Tap twice:
   saved; the drawer shows that person as Custom.
3. Remove `acl:Control` from your own line, or break the Turtle: Save stays
   disabled and the check says why.
4. Edit in two windows and save in both: the second is refused ("changed
   after this screen read them").
5. On a phone (≤ 40rem): the rules show, read only, with no Edit.
6. An item that follows its folder: its technical rules are its folder's,
   with no Edit, and the drawer says to give it rules of its own first.
