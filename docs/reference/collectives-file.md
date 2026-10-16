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
| `a hs:SharedFolder` | 1 | marks the entry |
| `hs:collective` | 1 | the collective's IRI (`config.ttl#<name>`, the group IRI) |
| `hs:folder` | 1 | the folder you picked, a full address ending in `/` inside your pod; any other is ignored |

`hs:` is the provisional namespace in `src/lib/vocab.ts`
(`https://pod.nicolasdb.eu/hyperscope/vocab#`).

## Who reads it

- **The backoffice**, to show and share the folder you picked. No entry:
  the collective's suggestion (`hs:bundleFolder`) is shown instead.
- **Your own agents**, to know where to put your contributions
  (solid-kit `procedure-contribution`); with no entry they fall back to
  `hs:bundleFolder`.

An entry is written when you share, and removed when you stop sharing
(the message's Undo puts it back).

Choosing is not sharing: whether the collective's agent can read the folder
is in the folder's rules, not here.
