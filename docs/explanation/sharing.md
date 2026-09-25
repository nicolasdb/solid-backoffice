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

Each collective gets its own folder under one parent:
`output2/hyperscope/`, `output2/mom/`. `output2/` itself stays private.
Sharing grants the collective's agent Read on its folder only, and the grant
is the consent: it lives on your pod and you can remove it there.

Everything you put in that folder is shared, including files added later.
The screen says so in one line.

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
- **Stop sharing**: the grant goes; nothing new is collected; earlier copies
  stay.
- **Leave**: your profile stops declaring the membership. Stopping sharing is
  a separate choice, offered at the same time.

Your documents stay on your pod. Copies stay where they were collected.
Revoking works forward only.
