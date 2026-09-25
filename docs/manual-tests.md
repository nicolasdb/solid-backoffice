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
