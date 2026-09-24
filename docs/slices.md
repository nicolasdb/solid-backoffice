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
