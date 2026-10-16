# Four questions before a grant

Every time the app asks you to give someone access, it answers four
questions on screen before you confirm:

- **Who** is asking: a person, a collective's agent, or one of your agents,
  named in words, with the WebID one tap away.
- **What** they will see or change: the folder, and whether it is Read or
  Edit.
- **Why** they need it: the job it serves, in one line.
- **What if not**: what happens if you refuse or stop, said plainly. A
  refusal must be legible, not punished.

The principle comes from pocpod0 (its PRD, "Consent is a 4-question
contract, not a checkbox"; the Anagnorisis principle, 25 Mar 2026). A grant
is consent (solid-kit ADR 006 §1.1), so it gets the same contract here.

It sits on the visible part of the iceberg. The rules it writes (`.acl`,
Turtle) stay below, under the technical rules, as in Pods.

## Where the app asks

| Grant | Who | What | Why | What if not |
|---|---|---|---|---|
| Share a folder with a collective | the collective's agent | the folder you picked, Read | it collects what you share into the collective's graph | nothing of yours reaches the collective; copies it already made stay |
| Your agents on the shared folder | each agent your profile names | the same folder, Edit | your agent writes your contributions there | you deliver files yourself |
| A folder for one of your agents | that agent | the folder you tick, Read or Edit | the use you give it (suggested: the folders you share) | the agent cannot reach it; it says so instead of guessing |
| Reset to inherit | — | the folder's own rules are deleted | to go back to the folder above | (shown: what the folder will then inherit, which may be public) |

The words on each screen follow this table. A new kind of grant gets a row
here before it gets a screen.
