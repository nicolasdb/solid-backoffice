# Slices

Each slice is usable on its own and is tested by a real person before the next
one starts. The order follows who is waiting: new members first, then the admin
who accepts them, then everyone's daily work.

## Where we are (25 Sep 2026)

Built and tested live: A (member side), role detection ("You run", "You
belong to"), the `output2/<collective>/` folder, and the test server with its
cast (`npm run test:pods`). On the live pod, HyperScope's `config.ttl` and
`membres.ttl` match `docs/examples/`; `config.ttl` is public, as the how-to now says.

**B is built** and passes against the test server (`test/pods/admin.test.ts`,
`member.test.ts`). Live on 25 Sep 2026: a request from a personal account,
accepted by the collective's account, then the agent's pull and confrontation
on the announced `output2/hyperscope/`. The live steps that need a second,
non-member account (newcomer's screen, refuse, remove) wait for the final
end-to-end run from a new account, after J1 rebuilds that path.

**J1 (account creation) is built and run live** (25 Sep 2026): a new
account from HyperScope's invitation, a taken username retried, name and
inbox set on the first home screen, asked to join, shared `output2/`,
accepted by the collective. The provider still asks for the password after
creation (the cookie spike did not spare it). Password reset needs SMTP on
the provider, which is not set: deferred, provider configuration, not this
repo. Still to run live from B: refuse, remove, and a message it does not
understand (manual-tests, steps 5 and 6).

Next: those two steps, then the layout pass (a design session from
[layout-brief.md](layout-brief.md)), C, D, E. In
[journeys](journeys.md) terms: J1, J3 and J5's admin side are built; J2, J4
and J6 work already; J7 is C, J8 is D.

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

## Layout pass · after B and account creation

Once the journeys are wired end to end: a desktop layout that uses the width
(the kit's single column is right on a phone, narrow on a screen), and the
landing page. Done steps already fold to their title (25 Sep 2026).

**L1 built and run live** (shell, tabs, home, a member's tab; 26 Sep 2026,
desktop and phone on test.nicolasdb.eu). **L2 built** (the collective's own
screen: requests beside a members table, a filter, the invitation link to
copy); live check next. **L3 built** (the landing: generic, or the invited
collective's words from its public `config.ttl`, its own slogan and
description when set; Newsreader self-hosted); live check next. L4 (members
and agent on a member's tab) after.

**Deferred (26 Sep 2026): the invitation link does not work live** (copied
from the collective's tab, opened or pasted into "Join another collective").
Symptoms not written down yet; look at it with L3, whose invited landing
starts from that link.

The `dev` branch deploys to test.nicolasdb.eu (`.github/workflows/ci.yml`);
push there to try a slice on a phone.

It is a design task, drafted in Claude Design from
[layout-brief.md](layout-brief.md) (screens, states, real content,
constraints, open questions). The code follows the mockups.

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

## C — Places: several pods in one workspace

A list of pods, stored on the user's own pod: their own, the collective's, and
any pod where someone granted them something (the Xavier case). One file
browser across them, with the ACL editor from `src/lib/acl.ts` on every place
where the user holds Control. Download is the minimum for binary files.
**Move** carries a folder's contents with it: renaming a folder in the old
backoffice left the files behind (found live, 25 Sep 2026). Following
(J7, [explanation/following.md](explanation/following.md)) is part of C too.

## D — Provider layer, shown only on our provider

Suggesting agents: the "Your agent" step already offers a collective
account its own `hs:agent`; D adds the WebIDs linked to the account on our
provider, so nobody types an agent's WebID by hand.

The CSS account API beyond sign-up (J1 creates the account and the first
pod): more pods on the same account, mint a WebID for an agent
(with the back-link to its human), mint and revoke connectors. Then the
Epic 9 access-log viewer. Hidden when the signed-in WebID comes from another
provider, because none of it is Solid protocol.

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
| Wipe pod contents, protected paths kept | C | keep the protected-path list |
| Sharing: only me / anyone with the link / one WebID read or edit | C | `acl.ts` already writes all three |
| Raw WAC view ("Show the technical rules") | C | |
| People & apps (who has access, from ACLs visited) | C | no pod-wide index exists; same limit |
| Create an account and pod (email, password) | J1 | done; guard kept: CSS treats an empty pod name as "claim the root" |
| More pods on the same account | D | |
| Agent WebIDs, linked by ownership proof; unlink | D | |
| App tokens (client credentials): list, create, revoke | D | |
| Claude connector: mint, list, revoke (`/onboard/*` on the provider) | D | the secret never reaches the browser; keep it so |
| 10-chapter learning onboarding for newcomers | open | decide: port with D's account creation, or drop |
| Demo pod (explore without an account) | open | ADR 005: per app; decide if the backoffice needs one |
| Readable-font toggle, alternate themes | open | the kit has light/dark only |
