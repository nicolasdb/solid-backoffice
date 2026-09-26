# Reading pods quickly

Every screen shows what the pods say now, never a stored copy of someone's
role or progress. That rule stays. What L5 changed is how the reads are made,
because on a real network each request costs a round trip, and a chain of
requests that wait for each other costs one round trip per link. Built and
run live on 26 Sep 2026: faster on the first load, instant between tabs.
The rules are solid-kit's
[ADR 007](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/007-reads-revalidate-never-trust-a-copy.md);
this page is what they mean here.

## Three rules, in order of what they save

**1. Start every read that does not need another one's answer.** A screen's
reads form a small tree: the profile names the collectives, a collective's
`config.ttl` names its roster, the inbox names the requesters. Only those
links have to wait. Everything else starts at once (`Promise.all`), and each
read waits only for the one that names it. This is what makes the first load
faster: measured with 300 ms per request, a member's home went from 2.6 s to
1.7 s, the collective's from 3.7 s to 1.5 s (`test/pods/speed.test.ts`).

**2. Draw from the last load, then read behind it.** The last load stays in
memory. A tab switch draws from it at once and reads the pods again; the
screen is redrawn only if the new reading would change it, and never while
someone is typing in it. A render that follows a write, or a first visit,
reads first and draws after, so what a button just did is always what the
screen shows. This is what makes tabs instant.

**3. Revalidate, never trust a copy.** Each displayed document keeps its ETag
and body in memory (`src/lib/read.ts`). The next read sends `If-None-Match`;
the server answers 304 when nothing changed, and the kept body is shown. The
server is asked every time, so this saves the download, not the round trip,
and a read on someone else's pod still reaches their access log.

## What never changes

- **Memory only.** Nothing read from a pod goes into localStorage,
  sessionStorage or IndexedDB: pod data must not outlive the session or reach
  the next person on the same browser. Both the last load and the kept
  documents are forgotten at sign-out.
- **Writes never start from a kept copy.** A write reads its base through
  `conditional.ts` and sends `If-Match`, as solid-kit ADR 003 says.
- **A cache can only save time.** When a provider refuses `If-None-Match`
  (its CORS, a proxy), the read is made again without it.

## For what comes next

Places (slice C) lists folders across several pods, so it multiplies the
reads. The same three rules apply: a folder's listing and the rules of what
is in it start together; opening a folder draws from what was last seen and
reads behind it; each listing is revalidated. Followed addresses go further,
because each read on someone else's pod lands in their access log: the
overview shows the title and excerpt kept on your own pod from your last
visit, and reads the address only when you open it.

Where a resource's `.acl` lives (its `Link: rel="acl"` header, a HEAD) is
asked once per session and kept in memory (`aclLocation` in
`src/lib/acl.ts`); whether the `.acl` exists, and what it says, is read
every time. Screens read through `readAccess`; a write still asks both
afresh (`getAccess`).
