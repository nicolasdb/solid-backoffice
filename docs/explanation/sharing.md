# Sharing with a collective

What a member sees and does. How the collective collects (snapshots,
versions, statuses) is
[ADR 006 §1 and §3](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md),
because the collective's agent does it, not this app.

## When

Sharing is offered as soon as you ask to join, so you can prepare. The
collective only collects once it has accepted you; until then the screen
says so.

## Folder

You pick the folder (slice G, 16 Oct 2026). The collective's `config.ttl`
only suggests one (`hs:bundleFolder`, such as `output2/hyperscope/`); the
picker offers it first, then the first two levels of your pod. The root,
`profile/`, `settings/` and `inbox/` are never offered: apps depend on them.
A folder can be shared with several collectives.

Before you share, the screen answers the
[four questions](four-questions.md): who (the collective's agent), what (the
folder and everything in it, Read only), why (it keeps a copy of each
version), and what if not.

Your choice is kept in `settings/collectives.ttl`
([reference](../reference/collectives-file.md)), readable by you and your
own agents only, so your agent knows where to put your contributions.

Sharing **adds** to the folder's rules, it never replaces them, the same as
adding a person in the access panel: the collective's agent Can read, each
agent your profile names (`acl:delegates`) Can edit, so it can deliver
files, and everyone the folder already named keeps what they had. A folder
without rules of its own gets a copy of the ones it followed, plus these.
A folder that does not exist yet is created starting from you and your
agents only, and so is any missing folder above it: nothing new turns
public. (Which rules apply where: [access rules](access-rules.md).) The
grant is the consent: it lives on your pod and you can remove it there.
(Overruled: until 16 Oct 2026 the folder was the app's, `output2/<name>/`,
and its rules were set whole.)

Everything you put in that folder is shared, including files added later.
The screen says so.

## Status

There is no "send" button. The collective's agent is told when the folder
changes, and checks it on a schedule in case a notification was lost.

For each file, the agent writes a status on the collective's pod (collected,
reviewed, flagged, error), which you can read as a member. The backoffice
shows it next to the file; your own agent or a script can read the same
document. The format is ADR 006 §3.

## Undo

Nothing already collected is ever removed, by either side.

- **Delete a file** from your folder: the collective marks it as removed and
  keeps the copies it made.
- **Stop sharing** asks first what the folder's rules become, each choice
  in words: who can open it after, who loses or gains access.
  - *Keep everything else as it is* (the default): only the collective's
    agent leaves the rules. Another collective it is shared with, your
    agents and anyone else the folder names keep their access.
  - *Follow the folder above again*: the folder's own `.acl` is deleted,
    so it follows what the folder above passes on. Offered when it has
    rules of its own.
  - *Only you and your agents*: offered while anyone else is still named.

  The screen says when another collective would lose the folder too, and
  when the collective could still read it through the folder above. One
  conditional write, based on the rules read when the question was asked;
  then the collective is told (an `as:Undo` of your announcement, ADR 006
  §1 step 5), so its members table stops listing the folder. Nothing new is
  collected; earlier copies stay. The message's Undo puts the rules back
  exactly as they were, and announces again.
- **Leave**: your profile stops declaring the membership. Stopping sharing is
  a separate choice, offered at the same time.

Your documents stay on your pod. Copies stay where they were collected.
Revoking works forward only.
