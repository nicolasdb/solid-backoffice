# Access rules: which ones apply

How a Solid server (WAC, `.acl` files) decides who can reach an item, and
what that means for the choices in Pods and for sharing.

## Nearest wins

Rules do not flow down from the pod's root and add up. The server starts
from the item and looks **up**:

1. The item's own `.acl`, if it has one.
2. Otherwise the folder it sits in, then that folder's folder, up to the
   pod's root. The first `.acl` found applies, through its `acl:default`
   rules.

The first `.acl` found is the only one used. Nothing merges, and nothing
higher up overrides it.

## What follows

- **Closer beats higher.** A file in `output2/hyperscope/` with its own
  public Read is public, whatever `output2/` and `hyperscope/` say. A
  folder cannot make the items inside it more private than they made
  themselves.
- **More private than the folder above takes rules of its own.** There is
  no "deny": an item is private by having an `.acl` that leaves others out.
- **"Inherit from parent" is not a rule.** It is the absence of an `.acl`:
  choosing it in Pods deletes the item's own. What the item then follows
  depends on the folders above, and changes when they change.
- **Every `.acl` stands alone.** It should name you with Control: one
  that leaves you out locks you out under WAC alone (some servers, CSS
  among them, still let a pod's owner in). The app always writes you in.
- **A new pod's root gives public Read** to what inherits from it. A folder
  with no rules anywhere between it and the root is public.

Pods shows, for each item, whether its rules are its own or inherited, and
from which folder ("Who can access it").

## In sharing

Sharing uses exactly this. `output2/<collective>/` gets rules of its own
while shared; stop sharing deletes them, so it inherits from `output2/`,
which is given rules of its own first when it has none, so that inheriting
never reaches the root's public Read.
→ [Sharing](sharing.md#folder)

A file you set apart inside the shared folder keeps its own rules: if they
leave out the collective's agent, the agent cannot read it, and if they
say public, it is public.
