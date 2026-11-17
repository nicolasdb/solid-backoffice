# Collective files

The files a collective's pod needs for the backoffice. Who may read and write
each container is
[ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md);
it is not repeated here. Setting them up:
[how-to](../how-to/set-up-a-collective.md).

The collective's agent reads the same files, following its
[procedures](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/procedures/README.md)
(pull, confrontation; in solid-css-overlay, beside the connector). A change
to a file's shape here means checking them.

## The pod tree

At the root of the collective's pod. What to copy is in
[`templates/collective/`](../../templates/collective/), laid out the same way.

| Path | Origin | Access |
|---|---|---|
| `config.ttl` | [template](../../templates/collective/config.ttl), filled at creation | public read; **written by the owner only, never the agent** |
| `membres.ttl` (`sc:roster`) | [template](../../templates/collective/membres.ttl), empty | members + agent read; written by the backoffice (owner) |
| `inbox/` (`ldp:inbox`) | created empty | any signed-in agent appends; the common agent reads |
| `profile/<name>` | the common agent's profile, made from You (its WebID is `profile/<name>#me`); `agents/agent` on pods set up before slice D, still read | public |
| `principles/procedure-*.md` (`sc:procedures`) | **copied from** the connector's [`procedures/`](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/procedures/) (generic) | members + agent read; owner writes, by ceremony |
| `principles/cultivate.md` (or equivalent) | **local**: the collective's principles | same |
| `guide/` (`sc:guide`) | **copied from** [`templates/collective/guide/`](../../templates/collective/guide/) (generic) | public, the whole folder: generic text, and an agent reads `onboarding.md` for someone who is not a member yet |
| `depots/`, `confrontations/` | created by the common agent | agent edits; members read |
| `chantiers/`, `briefs/`, `public/` | to be specified | **à délibérer** |

`procedures/` at the root is deprecated: procedures and principles live
together in `principles/`.

**Generic or local.** The procedures and the guide are the same text for
every collective, so the same instructions serve every member of every
collective. Two layers carry them: a generic skill
([`collectif`](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/skills/collectif/SKILL.md)) that holds the invariants and
resolves who, which collective and which role, through `config.ttl` only;
and the procedures on the pod, read at every session. A collective adds its
own history only as annexes of its copy (HyperScope: confrontation annexe C,
pull annexe D). The principles are the collective's alone, and so is
everything under `depots/` and after.

The files the backoffice itself reads are below.

## config.ttl

Template: [`templates/collective/config.ttl`](../../templates/collective/config.ttl)
(membership only, sharing commented out). Examples, both still in the old
namespace: [`examples/hyperscope-config.ttl`](../examples/hyperscope-config.ttl),
[`examples/mapsofmaking/`](../examples/mapsofmaking/).

The subject, `<#hyperscope>`, is the collective's IRI **and** its group IRI.
Members write `org:memberOf <…/config.ttl#hyperscope>`, so following that
link from a profile leads to this description.

`sc:` is `https://w3id.org/solid-collective/vocab#`. What each term means,
and why the namespace changed, is
[solid-kit ADR 006 §7](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md)
(amended 2026-11-17) and its
[`vocab.ttl`](https://github.com/nicolasdb/solid-kit/blob/main/docs/vocab/vocab.ttl);
the table says what the backoffice does with each.

| Property | Count | Meaning |
|---|---|---|
| `a sc:Collective` | 1 | marks the subject as a collective |
| `foaf:name` | 1 | shown to people |
| `sc:roster` | 1 | the roster document |
| `ldp:inbox` | 1 | where requests and announcements go |
| `sc:feature sc:Sharing` | 0–1 | members share a folder with `sc:agent`. Without it the collective is **membership only**: no agent needed, no sharing offered, and accepting grants Read on the roster alone. Other features are ignored |
| `sc:agent` | 1 with `sc:Sharing`, else 0–1 | the WebID members grant Read to when sharing, never a group. The address is the one You shows for the agent made from it: `profile/<name>#me` in the collective's pod. Named without `sc:Sharing`, it is only shown |
| `sc:suggestedFolder` | 0–1 | the folder suggested to members, relative to their pod root: `output2/hyperscope/` ([why](../explanation/sharing.md#folder)); each member picks their own. Plain segments only; `..` or an absolute path is refused, because this file decides where a member's app creates a folder |
| `schema:slogan` | 0–1 | the welcome screen's title for people invited to this collective ([below](#welcome-copy)) |
| `schema:description` | 0–1 | the paragraph under that title |
| `schema:url` | 0–1 | the invitation address, for agents ([below](#invitation-address)); the backoffice ignores it |
| `sc:requires` | 0–1 | **reserved**, see below |
| `sc:procedures` | 0–1 | the folder holding the agent's procedures and the collective's principles: `<principles/>` ([below](#agent-entry-points)) |
| `sc:guide` | 0–1 | the folder holding onboarding, FAQ and glossary: `<guide/>` |

A missing or repeated property is refused, not guessed: a guessed agent is a
grant to the wrong party. For the same reason a property given in both
namespaces (`sc:agent` and `hs:agent`) is refused, naming both.

**The old namespace** (`hs:`, `https://pod.nicolasdb.eu/hyperscope/vocab#`)
is still read, as before: a collective typed `hs:Collective` needs exactly
one `hs:agent` and one `hs:bundleFolder` (the old name of
`sc:suggestedFolder`), and sharing is on without `sc:feature`. The backoffice
never writes a `config.ttl`; its owner moves it to `sc:` by hand.

Read access is **public** (`foaf:Agent`): people read it before they are
members, to know where to send their request, and the welcome screen an
invitation opens reads it before anyone signs in. It holds nothing secret. WAC cannot limit this to WebIDs from one provider; it
names WebIDs one by one or through a group document. ACP can match on the
login server, but our pods use WAC.

### Agent entry points

`sc:procedures` and `sc:guide` are for agents, not for the backoffice, which
ignores them. The `collectif` skill follows them instead of writing a path
in, and accepts a procedure only from the pod that hosts this `config.ttl`.
The folders' contents are copied at creation ([the pod tree](#the-pod-tree)).
The common agent must not be able to write `config.ttl`: it names `sc:agent`
and `sc:procedures`, so an agent that could write it could rename itself or
repoint its own rules (2026-10-01: the agent's attempt to add
`hs:procedures` was refused with 403, as it should be).

### Welcome copy

`schema:slogan` and `schema:description` (schema.org, so no new `sc:` term)
let a collective speak for itself on the welcome screen an invitation link
opens. Without them, the screen uses the backoffice's own copy with the
collective's `foaf:name`. They are presentation only: a repeated one is
ignored and the backoffice's copy used, instead of refusing the file as for
the properties above, because no grant depends on them. The agent's
procedures do not read them.

The welcome screen runs **before sign-in**, which is why `config.ttl` is
public. A collective that restricts it to signed-in people still gets its
invitations; the screen then shows the backoffice's copy and the inviting
host.

Built in layout L3 (`src/welcome.ts`): both `http://schema.org/` and
`https://schema.org/` are read.

### Invitation address

`schema:url` (schema.org, so no new `sc:` term) holds the collective's
invitation link: the backoffice's address, `?collective=`, then the address
of this `config.ttl`. It is for an agent that greets someone who is not a
member yet: it reads the link here and hands it out. The backoffice ignores
it and builds the link from its own address, so a wrong one here misleads an
agent and nothing else. How to write it: [invite people](../how-to/invite-people.md#the-invitation-address-for-agents-optional).
It is a field of the protocol all the same; recording it in solid-kit
ADR 006 is still to do.

### Requirements

`sc:requires` will point to a SHACL shape describing what a member's profile
must contain (Maps of Making: a website and an address, for the map). The
backoffice will show a member what is missing, and show the admin a
pre-checked request. Reserved, not built; the parser ignores it today.

## membres.ttl

Example: [`examples/hyperscope-membres.ttl`](../examples/hyperscope-membres.ttl).

Two kinds of lines, both facts the collective owns:

- `<config.ttl#hyperscope> foaf:member <WebID>`. The subject is the IRI from
  `config.ttl`; a local `<#hyperscope>` would be `membres.ttl#hyperscope`, a
  different IRI, and nobody would be found.
- `<WebID> foaf:nick "nicolas"`: the short name used in `depots/` and
  `confrontations/` paths. Set at acceptance, never changed once used, and
  kept when the member is removed, so their earlier work stays filed under
  it and a returning member gets it back. A `foaf:nick` with no `foaf:member`
  line is therefore a reservation, not a member: the agent's procedures
  (pull v2, confrontation v3) skip it and name it in their report. A nick that
  never served (no `depots/<nick>/`) can be deleted by hand.

No names, no agents, no `foaf:Group` or `foaf:name` for the collective (that
is `config.ttl`'s): those are read where they live
([why](../explanation/membership.md#roster)).

## inbox/

A container. Anyone signed in may Append (send a request); only the
collective reads it.

Once the backoffice has answered an `as:Join` (accepted or refused), it
deletes it; the answer goes to the requester's own inbox. `as:Announce` and
anything it does not understand stay until deleted by hand.

The answers the collective sends, all Turtle, all with `as:actor` (the
collective's account WebID), `as:target` (the collective's IRI) and
`as:published`:

| Message | `as:object` |
|---|---|
| `as:Accept` | the `as:Join` it answers |
| `as:Reject` | the `as:Join` it answers |
| `as:Remove` | the member's WebID |

## Open

- **Members' Read on `guide/`.** Accepting a member into a collective that
  shares grants Read on the shared folders the backoffice knows (`depots/`,
  `confrontations/`, `chantiers/`, `briefs/`, `principles/`), not on
  `guide/`. Moot while the whole of `guide/` is public, as the how-to says.
  A membership-only collective grants the roster alone: those folders exist
  for the agent's pipeline.
- **Keeping a pod copy in step** with `templates/collective/` and the
  procedures: a version in each file (the procedures carry one in their
  title), a `principles/VERSION`, and a backoffice command run as a
  ceremony. Not built; it comes with copying the procedures to the pod.
- **Tooling.** All of the above is by hand today; a « create a collective »
  flow would follow the pod tree.
