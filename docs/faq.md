# FAQ

Each answer is one or two lines and a link to the page that owns it. If an
answer needs more, it belongs on that page, not here.

ADR 006 = [solid-kit ADR 006](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md),
ADR 001 = [solid-kit ADR 001](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/001-index-vs-truth.md).

## Accounts and sign-in

**Do I need a Solid account before I start?**
No. On our provider, the invitation offers to create one: username, email,
password. With an account elsewhere, you sign in with it instead.
→ [Membership](explanation/membership.md#newcomers)

**Is an agent WebID created with my account?**
No. You add one when you want one. → [Membership](explanation/membership.md#newcomers)

**Why can't I create an account with another provider here?**
Account creation uses our server's account API, which is not part of the
Solid protocol. → [Membership](explanation/membership.md#newcomers)

**Who is the "provider operator"?**
Anyone with an account on our provider, managing their own agents,
connectors and access logs. Running the server itself is another tool, out
of scope. → [Membership](explanation/membership.md#roles)

## Collectives

**How does the app know which collectives to show me?**
From your profile (`org:memberOf`), an invitation link, or an address you
paste. Nothing is built in. → [Membership](explanation/membership.md#roles)

**How do I run a collective?**
Sign in as the collective's own account. → [Membership](explanation/membership.md#roles)

**Can a collective join another collective?**
Yes, the same way a person does, and anyone can belong to several.
→ [Membership](explanation/membership.md#networks)

**Do I need a different backoffice for each collective?**
No. One backoffice shows all of them. A collective's own title and
paragraph on its invitation's landing come from its `config.ttl`; a custom
instance would only change branding. → [Membership](explanation/membership.md#instances)

**How do I set up a collective's pod?**
By hand, once. → [Set up a collective's pod](how-to/set-up-a-collective.md)

**Who can read `config.ttl`? Can it be limited to one provider's WebIDs?**
Anyone, signed in or not: the invitation's landing reads it before sign-in.
It holds nothing secret. A provider-wide limit does not exist in WAC.
→ [Collective files](reference/collective-files.md#configttl)

**How do I invite someone?**
Send the invitation link, copied from the collective's tab.
→ [Invite people](how-to/invite-people.md)

**Where do the words on the invited landing come from?**
The backoffice's own, unless the collective's `config.ttl` has a
`schema:slogan` or `schema:description`. → [Invite people](how-to/invite-people.md#the-collectives-own-welcome-words-optional)

**Can a collective ask for more than a name, like an address?**
Yes, later: `config.ttl` has a reserved line for the collective's
requirements. → [Collective files](reference/collective-files.md#requirements)

**What if a member renames themselves or replaces their agent?**
Nothing to update: the roster holds only WebIDs and the collective's own
short names; everything else is read from the member's profile. → [Membership](explanation/membership.md#roster)

## Sharing

**When can I share with a collective?**
Once you asked to join. The collective only collects after it accepted you.
→ [Sharing](explanation/sharing.md#when)

**Where do I put what I share?**
In `output2/<collective>/` on your own pod. → [Sharing](explanation/sharing.md#folder)

**Do I press "send" after adding a file?**
No. The collective's agent is told when the folder changes.
→ [Sharing](explanation/sharing.md#status)

**How do I know what happened to what I shared?**
The agent writes a status for each file on the collective's pod, and you can
read it. → [Sharing](explanation/sharing.md#status) · ADR 006 §3

**If I edit a file, what happens?**
The agent copies the whole changed file again (only that file) and runs the
checks on the new copy. → ADR 006 §3 "Versions"

**If I delete a file from my folder?**
The collective marks it as removed and keeps the copies it already made.
→ [Sharing](explanation/sharing.md#undo) · ADR 006 §3

**Does stopping sharing or leaving delete anything?**
No, on either side. Your documents stay on your pod; copies stay where they
were collected. → [Sharing](explanation/sharing.md#undo)

**Won't every save create a new version on the collective's pod?**
No: a copy is made only when the content changed, after the file has been
quiet for a while. Old versions may be pruned, never the ones a review
refers to. → ADR 006 §3 "Versions"

**Should the collective use git for versions?**
Not now. → ADR 006 §3 "Versions"

**Where are statuses stored: filename, frontmatter, a database?**
In a small Turtle file next to each copy, on the collective's pod. Oxigraph
is only an index rebuilt from it. → ADR 006 §3 · ADR 001

## Following

**What is "Following"?**
A reader for anything shared with you: a folder, a feed, a bundle, opened
with your WebID. → [Following](explanation/following.md)
