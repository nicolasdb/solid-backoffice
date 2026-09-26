# solid-backoffice

Accounts, permissions and membership for Solid pods: the backoffice from the
ecosystem atlas ([solid-kit `docs/atlas.md`](https://github.com/nicolasdb/solid-kit/blob/main/docs/atlas.md)).

It replaces `pocpod0/backoffice/`, which is frozen: it stays deployed until
this one covers what it did, and nothing new is added to it.

**Kit version:** copied from `solid-kit` at `b945ab8` (0.1.0), unchanged in
commit `9ed8327`. Every divergence from the kit is a diff against that commit.

## What it does now

- **Before sign-in, a landing** that explains pods and collectives. Opened
  from a collective's invitation link, it speaks for that collective (its
  name, its folder, and its own title and paragraph when its `config.ttl`
  has them) and offers to create an account on our provider first
  ([invite people](docs/how-to/invite-people.md)).
- **Signed in, tabs**: Home, one tab per collective you run or belong to,
  and Places (coming). On a phone the tabs move to a bottom bar.
- **Home**: the collectives you belong to, joining another one from its
  invitation link, and "You": your name, inbox and agent.
- **A collective you belong to**: share your folder with its agent (or
  stop), your membership and how to leave, its members and its agent.
- **The collective you run**: requests with what each requester's profile
  says, accept or refuse, the members table, messages it does not
  understand, and the invitation link to copy.
- Roles and membership are read from the pods at every visit, never stored
  ([membership](docs/explanation/membership.md#roles)). Light theme by
  default, dark one click away.

The protocol underneath is
[solid-kit ADR 006](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
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
npm run test:pods  # the app's code against a throwaway Solid server and test accounts
make             # deploy targets
```

Sign-in and every write to a real pod are covered only by
[`docs/manual-tests.md`](docs/manual-tests.md), never by `npm run verify`.
