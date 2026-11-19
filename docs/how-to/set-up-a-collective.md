# Set up a collective's pod

For whoever runs the collective, once, by hand. The backoffice has no
"create a collective" flow, but signed in as the collective's account it does
every step below: rules are set in Pods (`···` → Who can access it), never by
uploading an `.acl` (the server holds those; an upload is refused). What
ends up where, and why: [the pod tree](../reference/collective-files.md#the-pod-tree).

Two halves. **Membership** (steps 1–5) is enough to invite people and accept
them: a collective of members only names no agent, offers no sharing, and
accepting someone lets them read the roster, nothing else. **Pipeline**
(steps 6–11) is only for a collective with an agent that collects what
members share; it switches sharing on in `config.ttl` once the agent exists
(step 8). What the terms mean: solid-kit
[ADR 006 §7](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).

## Membership

1. **Create the account** for the collective on the provider, like a person's,
   and sign in to the backoffice with it. The name is permanent: it is in the
   collective's address and in every member's `org:memberOf`. The people
   are not: on a CSS provider, handing the collective over is adding the
   new coordinator's login to the account (its own email and password) and
   deleting the old one, in the provider's account page. Several
   coordinators may each keep a login.
2. **Create the inbox** from You → "Create my inbox". It makes `inbox/`, lets
   any signed-in account Append there, then names it `ldp:inbox` in the
   profile, in that order. `config.ttl` points at the same `inbox/`, so the
   account and the collective share one.
3. **Upload `config.ttl`** at the pod root, from the
   [template](../../templates/collective/config.ttl): replace every
   UPPERCASE value. Keep the `sc:` prefix as it is, and leave the three
   commented sharing lines at the end as they are: the file is then a
   collective of members only, with no agent to name. (Filled examples in
   the old `hs:` namespace, which is still read:
   [HyperScope's](../examples/hyperscope-config.ttl), and Maps of Making's,
   membership only, [`examples/mapsofmaking/`](../examples/mapsofmaking/).)
4. **Make it public**: Who can access it → **Anyone with the link**, Save.
   Public, because the invitation's welcome screen reads it before anyone
   signs in ([why](../reference/collective-files.md#configttl)). It holds
   nothing secret. Check in a private window: it opens without signing in.
5. **Upload `membres.ttl`** at the pod root, as in the
   [template](../../templates/collective/membres.ttl) (only comments and the
   prefix): accepting a
   request writes each member's lines. Then Who can access it → **Only me**,
   Save, even though nothing seems to change: that gives it rules of its own,
   and accepting is refused while it inherits (`acl-inherited`). Each member
   gets Read on it as you accept them.

## Pipeline (a collective with an agent)

6. **Create the agent** from You, with its connector. Its address is shown
   there: `profile/<name>#me` in the collective's pod (agents made by the
   old app sit in `agents/`, and still count). Read the address from You and
   compare it with what step 3 wrote.
7. **Let it act for the collective**: on You, the step "May act for you",
   offers the agent in one click. That writes `acl:delegates` in the
   account's profile, which is how the agent's skill checks it acts for this
   collective. Creating the agent does not do it.
8. **Switch sharing on** in `config.ttl`: uncomment `sc:feature sc:Sharing`,
   `sc:agent` and, if you suggest a folder, `sc:suggestedFolder`. `sc:agent`
   is exactly the address from step 6 (on a pod in a folder:
   `https://pod.nicolasdb.eu/hyperscope/profile/hyperscope-agent#me`; on a pod
   with its own subdomain: `https://openfab.pod.mapsofmaking.org/profile/openfab-agent#me`),
   a WebID, never a group. Replace the file with the edited one and keep it
   public. Members are offered to share a folder from then on.
9. **Give the agent Read on the roster and the inbox.**
   - `membres.ttl`: Who can access it → Named people → add the agent's
     address from step 6, Can read, Save. Its procedures read the roster to
     know whose folders to pull; without it they stop at the first step.
   - `inbox/`: Read with `acl:default`, so it applies to the messages inside
     (Pods → technical rules → Edit these rules, desktop only). Read only:
     the agent's pull reads the announcements and never deletes; the
     backoffice deletes a request as the owner.
10. **Fill `principles/` and `guide/`.** Copy the three `procedure-*.md` from
    the connector's [`procedures/`](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/procedures/)
    into `principles/`, then write the collective's principles beside them.
    Copy [`templates/collective/guide/`](../../templates/collective/guide/)
    into `guide/`. Give `principles/` its rules in step 11; make the whole
    of `guide/` public (Who can access it → **Anyone with the link**): it is
    generic text with nothing secret, and an agent must read `onboarding.md`
    for someone who is not a member yet.
11. **Give each shared folder rules of its own** once it exists (`depots/`,
    `confrontations/`, `chantiers/`, `briefs/`, `principles/`): Who can
    access it → **Only me**, add the collective's agent, Save. The agent's
    rights are in
    [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
    Accepting a member adds them, and each agent their profile declares, to
    every one of these once sharing is on (step 8), so accepting is refused
    while one of them still inherits: a grant written there would replace
    what it inherits.
    `depots/` and `confrontations/` are created by the agent on its first
    pull and confrontation: give them their rules once they exist.

## Check and invite

12. **Check** by signing in to the backoffice as an unrelated account and
    opening the invitation link: the collective's card appears, and
    `membres.ttl` stays unreadable.
13. **Check with an agent** (optional): ask an agent that has the `collectif`
    skill to look at the new collective. It reads from outside, proposes one
    next step and writes nothing; the file it follows is
    [`creation.md`](https://github.com/nicolasdb/solid-css-overlay/blob/main/mcp-connector/skills/collectif/creation.md).
14. **Invite** by sending the invitation link, copied from the collective's
    tab in the backoffice ([invite people](invite-people.md)): the backoffice's
    address, `?collective=`, then the address of `config.ttl`:
    - pod in a folder: `https://<backoffice>/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl`
    - pod on a subdomain: `https://<backoffice>/?collective=https://openfab.pod.mapsofmaking.org/config.ttl`

    Opened, it shows the invited welcome; pasted into "Join another
    collective" by someone already signed in, it finds the collective.

The rights for the other containers (`depots/`, `principles/`, …) are listed
in [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
