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
