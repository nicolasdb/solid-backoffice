# The following file

What you follow in Places (slice C5) is kept in one document on your own
pod, so any app of yours can read the same list. Why it works this way:
[following](../explanation/following.md).

**Where:** `settings/following.ttl` at your pod root. It follows the rules
of `settings/`, which on a fresh pod means only you can read it. Created on
your first follow (only if nothing is there yet); every change after that
is one conditional write of the whole document (`If-Match`), so a second
window or another app cannot erase a change unseen.

## One entry per address

Each followed address is a subject `<#f-…>` (a short hash of the address).

| Property | Count | Meaning |
|---|---|---|
| `a hs:Followed` | 1 | marks the entry |
| `schema:url` | 1 | the address followed, http(s) only; an entry with any other is ignored |
| `dct:title` | 1 | its title as last seen: a Markdown file's first heading, else its name |
| `schema:abstract` | 0–1 | the excerpt as last seen: a file's first lines, or a folder's first items (200 characters at most) |
| `dct:modified` | 0–1 | its last change as last seen (a folder: its newest item) |
| `hs:lastSeen` | 0–1 | when you last opened it |
| `hs:favourite` | 0–1 | `true` when marked; absent otherwise |
| `hs:unreadableSince` | 0–1 | set when opening it failed; removed when it can be read again |

`hs:` is the provisional namespace in `src/lib/vocab.ts`
(`https://pod.nicolasdb.eu/hyperscope/vocab#`); `schema:` is
`http://schema.org/`, `dct:` is `http://purl.org/dc/terms/`.

## When it is written

- **Follow**: only after the address was read with your WebID.
- **Open**: when the title, excerpt or last change differ from what is kept,
  or the last visit is more than an hour old; and when it cannot be read
  (`hs:unreadableSince`, once).
- **Favourite, unfollow** (unfollow can be undone from its message).

The list itself (Places' "Followed") reads only this document.

## Example

```turtle
@prefix hs: <https://pod.nicolasdb.eu/hyperscope/vocab#>.
@prefix schema: <http://schema.org/>.
@prefix dct: <http://purl.org/dc/terms/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.

<#f-1x2y3z> a hs:Followed;
    schema:url <https://pod.example/xavier/shared/>;
    dct:title "shared";
    schema:abstract "2 items: guide.md, plan.pdf";
    dct:modified "2026-09-25T16:05:00.000Z"^^xsd:dateTime;
    hs:lastSeen "2026-09-26T09:12:00.000Z"^^xsd:dateTime;
    hs:favourite true.
```
