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
`output2/hyperscope/`, `output2/mom/`. The folder is created when you first
share, not when you join (joining only writes `org:memberOf` in your profile
and sends the request). Its name comes from the collective's `config.ttl`
(`hs:bundleFolder`).

Sharing gives the folder **rules of its own**, set whole: you (Control,
as on everything of yours), each agent your profile names
(`acl:delegates`) Can edit, so it can deliver files, and the collective's
agent Can read. The folder belongs to the app, so whatever it followed or
held before is replaced, not merged. The grant is the consent: it lives on
your pod and you can remove it there. (Two earlier cuts are overruled: slice
A's gave only the collective's agent, and your own agent lost its access;
the next one copied what the folder inherited, and stopping could leave it
on "Only me". 27 Sep 2026.)

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
- **Stop sharing**: the folder's own rules are deleted; nothing new is
  collected; earlier copies stay. "Inherit from parent" is not a rule that
  could be restored, it is the absence of one: without its own `.acl`, the
  server applies the nearest folder above that has rules (`output2/`, or
  the pod's root).
- **Leave**: your profile stops declaring the membership. Stopping sharing is
  a separate choice, offered at the same time.

Your documents stay on your pod. Copies stay where they were collected.
Revoking works forward only.
