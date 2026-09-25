# Collective files

The files a collective's pod needs for the backoffice. Who may read and write
each container is
[ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md);
it is not repeated here. Setting them up:
[how-to](../how-to/set-up-a-collective.md).

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
| `hs:bundleFolder` | 1 | the folder members share through; today one name at their pod root (`output2hyperscope/`), moving to `output2/<collective>/` ([why](../explanation/sharing.md#folder)) |
| `hs:requires` | 0–1 | **reserved**, see below |

A missing or repeated property is refused, not guessed: a guessed agent is a
grant to the wrong party. `hs:` is provisional (ADR 006, open questions).

Read access is **any signed-in person** (`acl:AuthenticatedAgent`): people
read it before they are members, to know where to send their request. It
holds nothing secret. WAC cannot limit this to WebIDs from one provider; it
names WebIDs one by one or through a group document. ACP can match on the
login server, but our pods use WAC.

### Requirements

`hs:requires` will point to a SHACL shape describing what a member's profile
must contain (Maps of Making: a website and an address, for the map). The
backoffice will show a member what is missing, and show the admin a
pre-checked request. Reserved, not built; the parser ignores it today.

## membres.ttl

Example: [`examples/hyperscope-membres.ttl`](../examples/hyperscope-membres.ttl).

Only `<config.ttl#hyperscope> foaf:member <WebID>` lines. No names, no
agents: those are read from each member's profile
([why](../explanation/membership.md#roster)).

## inbox/

A container. Anyone signed in may Append (send a request); only the
collective reads it.
