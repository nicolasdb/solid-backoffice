# Collective files

The files a collective's pod needs for the backoffice. Who may read and write
each container is
[ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md);
it is not repeated here. Setting them up:
[how-to](../how-to/set-up-a-collective.md).

The collective's agent reads the same files, following solid-kit's
[procedures](https://github.com/nicolasdb/solid-kit/blob/main/docs/procedures/README.md)
(pull, confrontation). A change to a file's shape here means checking them.

All three sit at the collective's pod root.

## config.ttl

Example: [`examples/hyperscope-config.ttl`](../examples/hyperscope-config.ttl).

The subject, `<#hyperscope>`, is the collective's IRI **and** its group IRI.
Members write `org:memberOf <…/config.ttl#hyperscope>`, so following that
link from a profile leads to this description.

| Property | Count | Meaning |
|---|---|---|
| `a hs:Collective` | 1 | marks the subject as a collective |
| `foaf:name` | 1 | shown to people |
| `hs:roster` | 1 | the roster document |
| `ldp:inbox` | 1 | where requests and announcements go |
| `hs:agent` | 1 | the WebID members grant Read to when sharing |
| `hs:bundleFolder` | 1 | the folder members share through, relative to their pod root: `output2/hyperscope/` ([why](../explanation/sharing.md#folder)). Plain segments only; `..` or an absolute path is refused, because this file decides where a member's app creates a folder |
| `schema:slogan` | 0–1 | the welcome screen's title for people invited to this collective ([below](#welcome-copy)) |
| `schema:description` | 0–1 | the paragraph under that title |
| `hs:requires` | 0–1 | **reserved**, see below |

A missing or repeated property is refused, not guessed: a guessed agent is a
grant to the wrong party. `hs:` is provisional (ADR 006, open questions).

Read access is **public** (`foaf:Agent`): people read it before they are
members, to know where to send their request, and the welcome screen an
invitation opens reads it before anyone signs in. It holds nothing secret. WAC cannot limit this to WebIDs from one provider; it
names WebIDs one by one or through a group document. ACP can match on the
login server, but our pods use WAC.

### Welcome copy

`schema:slogan` and `schema:description` (schema.org, so no new `hs:` term)
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

Not built yet: part of the layout pass
([layout brief](../layout-brief.md)).

### Requirements

`hs:requires` will point to a SHACL shape describing what a member's profile
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
  it and a returning member gets it back.

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
