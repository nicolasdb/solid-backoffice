# solid-backoffice

Accounts, permissions and membership for Solid pods: the backoffice from the
ecosystem atlas ([solid-kit `docs/atlas.md`](https://github.com/nicolasdb/solid-kit/blob/main/docs/atlas.md)).

It replaces `pocpod0/backoffice/`, which is frozen: it stays deployed until
this one covers what it did, and nothing new is added to it.

**Kit version:** copied from `solid-kit` at `b945ab8` (0.1.0), unchanged in
commit `9ed8327`. Every divergence from the kit is a diff against that commit.

## What it does now

Slice A, the member's side of the handshake in
[solid-kit ADR 006](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md),
for someone who already has an account:

1. **Name**: `foaf:name` in their profile.
2. **Agent** (optional): `acl:delegates`, so what their agent writes is
   credited to them. It grants the agent nothing.
3. **Inbox**: `inbox/` on their pod, Append for anyone signed in, advertised
   as `ldp:inbox`. This is where a collective's answer lands.
4. **Join**: `org:memberOf` in their profile, then an `as:Join` to the
   collective's inbox. The state is read from both sides every time.
5. **Share**: creates the collective's folder (`output2hyperscope/`) on their
   pod, grants the collective's agent Read on it, then sends an `as:Announce`.

What is still to come, in order, is in [`docs/slices.md`](docs/slices.md).

## Adding a collective

The app has no list of collectives. A person sees the ones their profile says
they belong to, plus the one they were invited to or typed in. Setting up a
collective's pod is done by hand:
[docs/how-to/set-up-a-collective.md](docs/how-to/set-up-a-collective.md).

All documentation, arranged by kind, starts at [docs/README.md](docs/README.md);
questions go through the [FAQ](docs/faq.md).

## Commands

```bash
npm install
npm run dev      # the app at /
npm run verify   # typecheck + tests + design audit
make             # deploy targets
```

Sign-in and every write to a real pod are covered only by
[`docs/manual-tests.md`](docs/manual-tests.md), never by `npm run verify`.
