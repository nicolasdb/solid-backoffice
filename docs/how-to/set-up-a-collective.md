# Set up a collective's pod

For whoever runs the collective, once, by hand. The backoffice has no
"create a collective" flow, but signed in as the collective's account it does
every step below: rules are set in Pods (`···` → Who can access it), never by
uploading an `.acl` (the server holds those; an upload is refused).

1. **Create the account** for the collective on the provider, like a person's,
   and sign in to the backoffice with it.
2. **Create the inbox** from You → "Create my inbox". It makes `inbox/`, lets
   any signed-in account Append there, then names it `ldp:inbox` in the
   profile, in that order. `config.ttl` points at the same `inbox/`, so the
   account and the collective share one.
3. **Upload `config.ttl`** at the pod root, adapted from
   [`examples/hyperscope-config.ttl`](../examples/hyperscope-config.ttl)
   (Maps of Making's, membership only:
   [`examples/mapsofmaking/`](../examples/mapsofmaking/)): change the name,
   the `#fragment` and `hs:bundleFolder`. Keep the `hs:` prefix as it is
   (solid-kit ADR 006 §7).
4. **Make it public**: Who can access it → **Anyone with the link**, Save.
   Public, because the invitation's welcome screen reads it before anyone
   signs in ([why](../reference/collective-files.md#configttl)). It holds
   nothing secret. Check in a private window: it opens without signing in.
5. **Upload `membres.ttl`** at the pod root, with only the comments and the
   prefix ([example](../examples/mapsofmaking/membres.ttl)): accepting a
   request writes each member's lines. Then Who can access it → **Only me**,
   Save, even though nothing seems to change: that gives it rules of its own,
   and accepting is refused while it inherits (`acl-inherited`). Each member
   gets Read on it as you accept them.

   Once the collective has an agent (`hs:agent`), give it Read on `inbox/`
   too, with `acl:default` so it applies to the messages inside (Pods →
   technical rules → Edit these rules, desktop only). Read only: the agent's
   pull reads the announcements and never deletes; the backoffice deletes a
   request as the owner.
6. **Give each shared folder rules of its own** once it exists (`depots/`,
   `confrontations/`, `chantiers/`, `briefs/`, `principles/`): Who can
   access it → **Only me**, add the collective's agent, Save. The agent's
   rights are in
   [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
   Accepting a member adds them, and each agent their profile declares, to
   every one of these, so accepting is refused while one of them still
   inherits: a grant written there would replace what it inherits.
7. **Check** by signing in to the backoffice as an unrelated account and
   opening the invitation link: the collective's card appears, and
   `membres.ttl` stays unreadable.
8. **Invite** by sending the invitation link, copied from the collective's
   tab in the backoffice ([invite people](invite-people.md)):
   `https://<backoffice>/?collective=https://<pod>/<collective>/config.ttl`.
   Opened, it shows the invited welcome; pasted into "Join another
   collective" by someone already signed in, it finds the collective.

The rights for the other containers (`depots/`, `principles/`, …) are listed
in [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
