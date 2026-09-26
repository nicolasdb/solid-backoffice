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

Sharing **adds** Read for the collective's agent to the rules the folder
already follows; it never resets them. `output2/` is yours to arrange: your
own agent, for one, needs to write there to deliver files to your
collectives, and whatever `output2/` gives it reaches each collective's
folder too. So a folder that inherits gets rules of its own that start from
what it inherited, plus the agent. The grant is the consent: it lives on
your pod and you can remove it there. (The first cut, slice A, started the
folder's rules from nobody and silently took your agent's access away;
overruled on 26 Sep 2026.)

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
  stay. If nothing else set the folder apart, it follows `output2/`'s rules
  again ("Inherit from parent"); otherwise it keeps its own, minus the agent.
- **Leave**: your profile stops declaring the membership. Stopping sharing is
  a separate choice, offered at the same time.

Your documents stay on your pod. Copies stay where they were collected.
Revoking works forward only.
