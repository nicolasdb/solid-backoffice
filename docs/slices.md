# Slices

Each slice is usable on its own and is tested by a real person before the next
one starts. The order follows who is waiting: new members first, then the admin
who accepts them, then everyone's daily work.

## A — Member side of the handshake · built

For someone who already has an account. Name, agent, inbox, join, share. The
first live test is Neil's (see `manual-tests.md`, "Slice A").

Not in A, on purpose:

- **Creating an account.** That is the CSS account API, which belongs to the
  provider layer below. Until then, new people register on the provider's own
  page and come back here.
- **The agent's profile pointing back at its human.** ADR 006 wants both sides.
  The agent's profile is written when the agent is minted, which is also
  provider layer.

## B — Admin side of the handshake

On the collective's pod, for its owner:

- read `inbox/`, list pending `as:Join` requests, showing each requester's
  own declarations (name, `memberOf`, agents);
- accept: add `foaf:member` to the roster, send `as:Accept` to the requester's
  inbox; refuse: send `as:Reject`;
- show every member's state from both sides, including "left";
- show which members share a folder with the collective's agent, from the
  `as:Announce` messages. Only the member's pod can confirm the grant.

Accepting and granting stay two writes (ADR 006 §2), even behind one click.

## C — Places: several pods in one workspace

A list of pods, stored on the user's own pod: their own, the collective's, and
any pod where someone granted them something (the Xavier case). One file
browser across them, with the ACL editor from `src/lib/acl.ts` on every place
where the user holds Control. Download is the minimum for binary files.

## D — Provider layer, shown only on our provider

The CSS account API: create an account and a pod, mint a WebID for an agent
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
| Upload, rename (copy then delete), delete with a count of what is inside | C | |
| Editor with live preview (Markdown, JSON check, code) | C | |
| Wipe pod contents, protected paths kept | C | keep the protected-path list |
| Sharing: only me / anyone with the link / one WebID read or edit | C | `acl.ts` already writes all three |
| Raw WAC view ("Show the technical rules") | C | |
| People & apps (who has access, from ACLs visited) | C | no pod-wide index exists; same limit |
| Create an account and pod (email, password) | D | keep the guard: CSS treats an empty pod name as "claim the root" |
| More pods on the same account | D | |
| Agent WebIDs, linked by ownership proof; unlink | D | |
| App tokens (client credentials): list, create, revoke | D | |
| Claude connector: mint, list, revoke (`/onboard/*` on the provider) | D | the secret never reaches the browser; keep it so |
| 10-chapter learning onboarding for newcomers | open | decide: port with D's account creation, or drop |
| Demo pod (explore without an account) | open | ADR 005: per app; decide if the backoffice needs one |
| Readable-font toggle, alternate themes | open | the kit has light/dark only |
