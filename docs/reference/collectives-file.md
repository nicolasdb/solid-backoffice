# The collectives file

Which folder you share with each collective (slice G) is kept in one
document on your own pod. Why it works this way:
[sharing](../explanation/sharing.md).

**Where:** `settings/collectives.ttl` at your pod root, with rules of its
own: you, and Read for each agent your profile names (`acl:delegates`) when
you share. Nobody else, whatever `settings/` allows. Created empty on your
first share, given those rules, and only then written to; every change after
that is one conditional write of the whole document (`If-Match`). The first
time, the app also writes `settings/README.md` (never over one already
there): what the folder is, and that changing its files can break apps.

## One entry per collective

Each collective is a subject `<#c-…>` (a short hash of its IRI).

| Property | Count | Meaning |
|---|---|---|
| `a sc:SharedFolder` | 1 | marks the entry |
| `sc:collective` | 1 | the collective's IRI (`config.ttl#<name>`, the group IRI) |
| `sc:folder` | 1 | the folder you picked, a full address ending in `/` inside your pod; any other is ignored |

`sc:` is `https://w3id.org/solid-collective/vocab#` (the terms:
[solid-kit `vocab.ttl`](https://github.com/nicolasdb/solid-kit/blob/main/docs/vocab/vocab.ttl)).
A file written before ADR 006 §7 holds the same terms under `hs:`
(`https://pod.nicolasdb.eu/hyperscope/vocab#`): it is read as it is, and
rewritten in `sc:` the next time the backoffice saves it, not before. A file
holding both reads each collective once; its `sc:` entry wins.

## Who reads it

- **The backoffice**, to show and share the folder you picked. No entry:
  the collective's suggestion (`sc:suggestedFolder`, `hs:bundleFolder` in
  an old `config.ttl`) is shown instead, or, when it suggests none, you
  pick one.
- **Your own agents**, to know where to put your contributions
  (solid-kit `procedure-contribution`); with no entry they fall back to
  that suggestion.

An entry is written when you share, and removed when you stop sharing
(the message's Undo puts it back).

Choosing is not sharing: whether the collective's agent can read the folder
is in the folder's rules, not here.
