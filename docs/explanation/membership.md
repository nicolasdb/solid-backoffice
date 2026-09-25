# Membership

Why the backoffice shows what it shows about people and collectives. The
protocol (who writes what, in which order) is
[ADR 006 §2](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md);
this page is about what the app does with it.

## Roles

The app never stores a role. At each sign-in it reads the pods and shows
whatever applies. One account can hold several roles at once.

| Role | Read from | Shown as |
|---|---|---|
| Runs a collective | `pim:storage` in your profile, then a `config.ttl` at that pod root declaring an `hs:Collective` | "You run" |
| Belongs to a collective | each `org:memberOf` in your profile, and the collective's roster | "You belong to", with the state from both sides |
| Invited | `?collective=` in the link that opened the app | that collective's card, even before sign-in |
| Account holder on our provider | your WebID's login server is ours | agents, connectors, access logs |
| Follows others | your list of followed addresses, on your pod | [Following](following.md) |

**Running a collective means signing in as the collective's own account.**
That is a deliberate choice: the collective is an account like any other, so
everything that works for a person works for it. A person given rights on a
collective's pod is not treated as its admin.

`pim:storage` is used because it is how a profile names its pod root, and
the collective's files sit at that root. The kit already reads it first when
finding a pod, and never guesses a root from the WebID's shape.

Your WebID's provider is the only role check that is not Solid protocol.
Everything that depends on it is hidden for WebIDs from other providers.

## Newcomers

Most newcomers have no Solid account and already know the collective that
invited them. So the invitation offers "Create an account" first:
username, email, password, like any sign-up. On our provider the pod and the
WebID take the username; the address is shown under the field, in small.

Someone with a Solid account elsewhere chooses "I already have a Solid
account" and signs in with their provider. Our provider is the default at
sign-in; others are typed in.

Account creation only exists on our provider, because it uses our server's
account API, which is not part of the Solid protocol.

No agent WebID is created at sign-up. An agent is useful to someone who
already works with one, and asking a newcomer about it before they have
joined anything is one question too many. It stays a separate step, taken
when the person wants it.

## Networks

A collective joins another collective exactly as a person does: signed in as
the collective, it declares `org:memberOf` and sends a request. Any account
can belong to several collectives. This is what lets one collective grow into
a network of collectives (1, then 1+n, then n+n) with no new mechanism.

A collective is never offered to join itself.

## Instances

One backoffice shows all the collectives you run or belong to. A custom
instance (Maps of Making, for example) changes the landing page, the
branding, and the collective its invitation points to; it never changes what
you can see or do. You can join Maps of Making from the HyperScope instance
without switching apps.

An instance that needs more than its configuration to work means the
backoffice is not generic enough, and that is a bug in the backoffice.

## Roster

The roster (`membres.ttl`) holds only `foaf:member` lines: WebIDs, nothing
else. Names, agents and inboxes are read from each member's own profile.

That keeps one source of truth per fact, and it is what makes changes on a
member's side harmless:

- **A new name** shows up everywhere at the next read.
- **A replaced agent** changes only that agent's own grants. The member's
  sharing is a grant to the *collective's* agent, so it is untouched.
- **A new WebID** is a new member. The old one's state becomes "left" once
  its profile no longer declares the membership.

The cost: if a member's pod is down, the admin sees a WebID instead of a
name. That is the honest state.
