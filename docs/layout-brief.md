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

## Answers so far (25 Sep 2026)

- **Landing page = the welcome screen** before sign-in or account creation.
  Today it is a heading, one line and a field (see "Welcome" above): it
  explains nothing to someone who has never heard of a pod.
- **The collective's view gets its own screen**: requests, members and other
  messages move out of the home screen. Home keeps a summary card ("You run
  HyperScope · 2 members · 0 requests") that leads there.
- **Home and navigation: option A, tabs** (chosen on the mockups, 25 Sep
  2026). Desktop: tabs at the top (Home, one per collective you run, Places
  once C exists), your collectives in the wide column and a compact "You"
  checklist beside them. Phone: the same tabs as a bottom bar. The other
  two options (a side rail; a home of cards) are kept on the canvas.
- **Landing**: the solid-dash pattern, drawn invited and not invited. The
  closing diagram shows the ladder as groups of groups: you, HyperScope,
  and a network of four collectives with 3 to 5 members each.
  The copy as drawn is approved, desktop and phone.
- **Collective's own screen: side by side** (requests left, members right).
  As built (L2): on a phone, chips that scroll to Requests, Members and
  Other instead of the mockup's tablist (buttons, since the address's
  fragment belongs to the router); the members table turns into one block
  per member.
- **Landing, as built (L3):** "How it works" and the form switch are
  buttons, not `#` links; the not-invited "Join a collective" step says
  joining starts with the invitation link its people send.
- **A member's view** (the collective's tab, for a member): as drawn, to try.
  Sharing first, membership below with a quiet Leave; the roster's members
  and the collective's agent beside them. New: members see the roster,
  which accepting already lets them read.
- **Two landings, one app.** Not invited: a full page that explains the
  backoffice itself (generic copy, same sections). Invited: the same page,
  with the collective's name and folder read from the invitation's
  `config.ttl`. Decided: a collective's own title and paragraph come from
  optional `schema:slogan` and `schema:description` in `config.ttl`
  ([reference](reference/collective-files.md#welcome-copy)), falling back
  to the generic copy. That is how E gets its landing without code. They
  show before sign-in only when `config.ttl` is public.
- **Places** (slice C, first draft): places on the left (your pod, what you
  follow), the file browser in the middle, the selected item's panel on the
  right; on the phone, a place picker, the list, and a sheet per item.
  Asked for since: a **last modified** column (the container listing's
  `dct:modified`), and **Restore from parent** in the permissions: whether
  an item has rules of its own or follows its parent folder, and a way to
  drop its own `.acl` so it follows the parent again (asked once more; the
  pod root has no parent, so never there).

The mockups: [Backoffice layout](https://claude.ai/artifact/93WGYDxdEaB7DcyZBV4KVk)
(a Claude Design canvas, private to its owner).

## Inspiration for explaining a pod

**[solid-dash](https://dashboard.nicolasdb.eu/)** (same kit, same tokens; in
French). Its landing page is the pattern to borrow:

- a nav bar: brand, "Comment ça marche", "Voir un exemple", "Se connecter";
- a hero on a 7 / 5 grid: an eyebrow ("Un tableau de bord qui vous
  appartient"), a serif title ("Vos efforts vous appartiennent."), a pull
  line ("Ce que vous en montrez aussi."), one concrete paragraph with a real
  example; beside it, a sign-in panel ("Déjà inscrit ?", the address field,
  a link to find a provider);
- "Pourquoi": who benefits, and the one line that carries the idea ("Aucun
  d'eux n'a besoin de lire votre carnet.");
- "Comment ça marche": four numbered steps, each a short name and a
  sentence (your data → your progress → your summary → your readers);
- "Et ensuite": the scale, "Un résumé, puis dix, puis cent", with a diagram
  of nested shapes (you, a pair, a group, a network);
- a footer: "Aucun serveur entre vous et vos données — tout se passe dans
  votre navigateur. Construit sur Solid, un standard ouvert du web."

**[The Liminal Institute](https://tuuli.in/liminal_institute/)**: text first,
generous white space, numbered sections, one strong opening claim
("Civilizations are formed by interaction patterns."), and the ladder
"individual → pair → group → organization → network → civilization". The
backoffice has the same ladder: a person, a collective, a collective of
collectives (J6).

What the backoffice's welcome must add to that pattern: the invitation
(who invites you, to what) and account creation as the primary action when
invited, sign-in when not.

## Open questions for the design session

1. The home screen on a wide screen: what sits beside what, and does "You"
   (setup, done once) deserve the same weight as the collectives (ongoing)?
   Show options.
2. Where navigation lives once C adds Places, without building C now: tabs,
   a side rail, or cards leading to screens. Show options.
3. The collective's own screen: requests first or members first, and how it
   holds 40 members and 10 requests.
4. The welcome screen, invited and not invited, on the solid-dash pattern:
   how it explains a pod in one glance to someone who has never heard of
   Solid, with the sign-up form as heavy as it is.
5. E: the same welcome with Maps of Making's copy. What changes besides the
   words?
