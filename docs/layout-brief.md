# Layout brief — for the design session

The input to the layout pass ([slices](slices.md#layout-pass--after-b-and-account-creation)).
The layout is drafted in Claude Design from this page; the code follows the
mockups that come back, not the other way round. Everything below is taken
from the code as of J1 (`src/signup.ts`, `src/onboarding.ts`, `src/admin.ts`),
so the design starts from what exists rather than from memory.

## What the app is, in one paragraph

A backoffice for Solid pods: a person's own pod, and the collectives they
belong to or run. It holds three things: who you are (name, agent, inbox),
which collectives you belong to (ask to join, share a folder, leave), and, for
an account that runs a collective, its requests and members. Everything is
read from the pods on every visit; nothing about roles or progress is stored.
Why it works this way: [membership](explanation/membership.md),
[sharing](explanation/sharing.md).

## Who comes, and what they do

| Journey | Person | Screens | Frequency |
|---|---|---|---|
| J1 | Invited, no account | welcome (create) → provider's page → home | once |
| J2 | Invited, has an account elsewhere | welcome (sign in) → provider → home | once |
| J3 | Runs a collective | home, "You run": requests, members | weekly |
| J4 | Member | home, "Share with …" | once per collective |
| J5 | Member or collective | home: Leave / Remove | rare |
| J6 | A collective joining another | home, as J2 | rare |
| J7 | Anyone (slice C) | Places: pods shared with you, a file browser | daily, later |
| J8 | Anyone on our provider (slice D) | agents, connectors, access log | occasional, later |

Today most visits are one-off setup (J1, J2, J4). Once C exists, the app is
daily work, and the setup screens become something you pass through once.

## Screens and their states

### Welcome (before sign-in)

- **Invited** (`?collective=…` in the link): heading "You're invited to join a
  collective", the inviting host shown in code, one line on what a pod is.
  Primary: the sign-up form. Secondary: "I already have a Solid account".
- **Not invited**: heading is the app name. Primary: sign in (pod or WebID,
  one field). Secondary: "Create an account".
- **Sign-up form**: Your name → Username (follows the name; the pod address
  appears under it, e.g. `https://pod.nicolasdb.eu/neil-armstrong/`) → Email →
  Passphrase ("four random words you'll remember", with the
  `correct-horse-battery-staple` hint) → Type it again → Show passphrase →
  "Create my account". A line under the button says the provider's page will
  sign you in next. Errors sit under their field.
- **After a taken username**: email and passphrase locked, "Choose another
  username to finish."
- **No provider configured** (another instance): sign-in only.

Then the provider's own page (not ours, not designable) and back.

### Home (signed in), top to bottom

1. **Top bar**: the WebID (long: `https://pod.nicolasdb.eu/neil-armstrong/profile/card#me`), "Sign out".
2. **Heading**: the person's name, or "Your collectives" if none yet.
3. **You run** (only if the pod holds a collective's `config.ttl`):
   - a card with the collective's name, "3 members · 1 request", the address
     to give people, the invitation link (not shown on localhost);
   - one card per **request**: the requester's name and WebID, when sent,
     three facts from their profile (says they belong: yes/no; agents; has an
     inbox), warnings, a short-name field (`neil`), **Accept** / Refuse, and a
     line explaining that accepting is two writes;
   - **Members**: a list, each with name, WebID, short name, state ("Member:
     both sides agree." / "Left: …" / profile unreadable), folders announced,
     "Let them read it" if accepting stopped halfway, Remove (asks twice);
   - **Other messages**: inbox items that are not requests, each deletable.
4. **You**: one lead line ("Everything here is written on your own pod…"),
   then three steps, each a card with a status label (To do / Done / Optional);
   a done step folds to its title:
   - Your name (field + Save);
   - Your agent, optional (list of WebIDs with Remove, a suggestion with Add,
     a field);
   - Your inbox (Create my inbox / Use this inbox / its address when done).
5. **You belong to**: per declared collective, two steps: "Join X" (state
   line, Send again / Leave) and "Share with X" (the folder
   `output2/hyperscope/`, what sharing means, Share the folder / Stop sharing).
   Empty: "No collective yet."
6. **Not joined yet**: invited or looked-up collectives, "Ask to join"
   (disabled until the inbox exists) / "Not now".
7. **Broken collectives**: error cards ("not open to newcomers yet" / "could
   not be found"), each with a way forward.
8. **Join a collective**: a field for a collective's address, "Look it up".
9. Other memberships in the profile, not managed here: one meta line.

### States every screen has

Loading ("Reading your profile and your collectives…", "Setting up your name
and your inbox…" after J1), error with a way forward (`renderError`), empty,
toasts and screen-reader announcements after each write.

## Real data shapes to design with

- WebIDs and URLs are long and unbreakable; they already wrap inside cards.
- A collective with 0, 3 and 40 members; 0, 1 and 10 requests.
- A person in 0, 1 and 4 collectives, one of which they also run.
- Names from 2 to 40 characters; no avatars (profiles rarely have one).

## What is coming, so the layout has room for it

- **C, Places**: several pods in one workspace (your own, a collective's, one
  someone shared with you), one file browser across them, an ACL editor where
  you hold Control, an editor with preview, upload / rename / move / delete.
  This is the daily screen, and it needs navigation the home screen does not
  have today.
- **D, provider layer** (only on our provider): more pods, agent WebIDs,
  connectors (mint, list, revoke), app tokens, the access-log viewer.
- **E, Maps of Making**: the same app with another collective's
  `config.ttl` and its own entry page. If that needs more than config and
  copy, the layout is not generic enough.

## Constraints

- **Tokens only** (`src/styles/theme.css`): sage accent, warm paper surfaces,
  system fonts, a type scale from `--text-display` to `--text-micro`. Light
  and dark both; `npm run verify` audits contrast (AA) and raw values.
- **Phone first**: today one column of 40rem. `dvh` and safe-area insets are
  load-bearing (`src/styles/core.css`). Desktop must use the width.
- **At most four things per step, one primary action per screen**, done steps
  fold, progress visible: the UX review in [manual-tests](manual-tests.md#ux-review)
  and [ux-principles](ux-principles.md).
- **Plain HTML and CSS** rendered from TypeScript strings, no framework:
  anything designed must be buildable with `<section>`, `<details>`, forms
  and CSS grid or flex.
- **Accessible**: keyboard first, focus moved to each view's title
  (`src/ui/a11y.ts`), state never shown by color alone.
- **Copy stays**: the wording has been reviewed; the layout may move it, and
  the design session should flag copy it would change rather than rewrite it.

## Open questions for the design session

1. The home screen on a wide screen: what sits beside what, and does "You"
   (setup, done once) deserve the same weight as the collectives (ongoing)?
2. What "landing page" means: the welcome screen before sign-in, a public page
   per collective (the invitation's destination), or both. This ties to E.
3. Where navigation lives once C adds Places, without building C now.
4. The collective's view (requests, members) as part of home, or as its own
   screen once there are many members.
5. How the welcome screen explains a pod in one glance to someone who has
   never heard of Solid.
