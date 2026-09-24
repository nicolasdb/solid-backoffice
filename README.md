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
they belong to (`org:memberOf`), plus the one they were invited to or typed in.

A collective is described by a `config.ttl` on its own pod, and its IRI
(`config.ttl#hyperscope`) is also the group IRI members point at, so a
profile's `org:memberOf` link leads straight to it. For HyperScope:

1. upload [`docs/examples/hyperscope-config.ttl`](docs/examples/hyperscope-config.ttl)
   as `hyperscope/config.ttl`, with Read for `acl:AuthenticatedAgent`;
2. change the subject in `membres.ttl` to `<config.ttl#hyperscope>`, as in
   [`docs/examples/hyperscope-membres.ttl`](docs/examples/hyperscope-membres.ttl);
3. invite people with `https://<backoffice>/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl`,
   or give them that address to paste.

## Commands

```bash
npm install
npm run dev      # the app at /
npm run verify   # typecheck + tests + design audit
make             # deploy targets
```

Sign-in and every write to a real pod are covered only by
[`docs/manual-tests.md`](docs/manual-tests.md), never by `npm run verify`.
