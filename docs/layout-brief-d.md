# Layout brief, slice D — for the design session

The input to D's design session ([slices](slices.md#d--provider-layer-shown-only-on-our-provider)).
Like the [first brief](layout-brief.md), the layout is drafted in Claude
Design from this page and the code follows the mockups. Everything below
is taken from what exists on 27 Sep 2026: this repo's code, the old
backoffice (`pocpod0/backoffice/pod-api.js`, which did most of D live),
the provider's backlog (pocpod0 `epics.md`, Story 7.16 and Epic 9), and
CSS's own account API documentation (latest).

## What D is, in one paragraph

You, the page under the avatar, today holds your name, your inbox, your
agent and your profile's source. D gives it what only our provider can
do: your pods, the agents you create, the connectors and tokens that act
as them, and later the log of who read your pods. None of that is Solid
protocol, so it shows only when you signed in with a WebID from our
provider, and is hidden (never greyed out) otherwise. **People & apps**
comes with D but is the opposite case: who can reach what, from the
rules on your pod, which is Solid protocol and shows on any provider.

## Who comes, and what they do

The live evidence (Story 7.16, three teammates on 23 Sep 2026): going
from "I have a pod" to "Claude can read my folder" took creating an
agent, minting a connector as that agent, adding it in claude.ai, then
copying the agent's WebID from one screen and pasting it into a folder's
sharing panel. Each teammate needed to be guided in person. D's main
journey is that path, without the copy-paste.

| Journey | What the person wants | Frequency |
|---|---|---|
| J8a | **Let Claude use a folder**: make an agent (or pick one), connect Claude as it, choose the folders it may read or edit | once per agent |
| J8b | Check what an agent can reach; stop it (revoke the connector, remove its grants, unlink it) | occasional |
| J8c | Who read my pods (the access log) | occasional, after something odd |
| J8d | A second pod on the same account; an app token for a script | rare |
| People & apps | Who can reach what on my pod, and remove someone | occasional |

## What exists today

- **You** (`src/you.ts`): name, full WebID copied with a click, the steps
  (name, inbox, agent), then `profile/card` read only, the lines each step
  wrote marked, and "Open in Pods". "Your agent" is `acl:delegates` in
  the profile: the WebIDs that may act for you, and that sharing gives
  Can edit on a shared folder. It suggests the collective's `hs:agent`
  when you run one.
- **The account API** (`src/lib/css-account.ts`): used once, for J1
  (account, password, first pod), authenticated with the
  `CSS-Account-Token` the sign-up returns.
- **Pods' access panel** (`src/access-panel.ts`): Only me, Inherit,
  Anyone with the link, named people with Can read or Can edit, one
  WebID per grant, saved in one conditional write. The folder grant in
  J8a should reuse it rather than draw a new one.

## Screens and their states

Every screen: loading, empty, error with a way forward, and a toast plus
a screen-reader announcement after each write (as in the first brief).

### You, extended (our provider only)

In the iceberg order Pods uses: what is seen first only reads, each step
down asks one more deliberate move.

1. **See**: your identity (name, full WebID, as today); **your pods**
   (each pod's address, "yours" or the owners it has); **your agents**
   (name, WebID, whether it is in your `acl:delegates`, whether a
   connector acts as it, and a count of the folders it can reach as far
   as the app has read); **connectors** (label, which agent, created).
2. **Change**: new pod (a name, then the address it will have); new agent
   (a name → `…/agents/<name>#me`); "Let Claude use a folder" (below);
   add an agent to your `acl:delegates` (the existing agent step).
3. **Dig**: revoke a connector; unlink an agent from the account (it can
   no longer sign in or get tokens; its document stays until deleted in
   Pods); app tokens (list, create, revoke) with the one-time secret;
   pod owners (add or remove a linked WebID on a pod).

### Let Claude use a folder (J8a, guided)

1. **Which agent**: the agents you have, or "a new agent" with a name
   field. Creating one is four writes in a row (below); on failure, say
   which step and what was cleaned up.
2. **Connect Claude**: mint the connector as that agent; show the
   connector URL to paste into claude.ai, with where to paste it. The
   secret stays on the provider and never reaches the browser.
3. **Which folders**: a folder picker on your pod; each folder chosen
   gives the agent Can read or Can edit, one WebID per grant, through the
   same write as the access panel. No WebID is typed or pasted anywhere.
4. **Done**: what the agent can now reach, and how to stop it.

A person who stops halfway comes back to the step they left: each step's
result is on the pod or the provider, never stored as progress.

### Access log (our provider only; waits on the provider)

Epic 9.3's viewer: time, who (a name, a WebID, or "anonymous"), which
item, which mode, allowed or denied. Filters: time range, outcome, who,
folder. Your own identities hidden by default. "Denied after you revoked
it" called out in text, never by colour alone. **The provider has no
endpoint yet** (Epic 9 is backlog: `/.account/access-log/`, account
cookie, 90 days kept).

### People & apps (a tab; any provider)

Who can reach what on your pod, grouped by person or agent: each with
the items they can read or edit, and "Change" leading to that item's
access panel. Solid has no index of rules, so the list is only as
complete as the folders the app has read. Say so plainly: "From the 14
folders read, last checked 10:42", with "Check the whole pod" (reads
every folder's rules on your own pod only, so it lands in nobody else's
log). A person who has left a collective but still has access is flagged,
as in the access panel.

## Real data shapes to design with

- Pods: `https://pod.nicolasdb.eu/neil-armstrong/`, 1 to 3 per account.
- Agents: `https://pod.nicolasdb.eu/neil-armstrong/agents/claude#me`,
  0 to 4; names up to 64 characters. The collective's agent
  (`…/hyperscope/agents/…`) sits on another account.
- Connectors: a label ("Claude, laptop"), the agent, a date; 0 to 5.
- App tokens: ids like `backup-script_6f1c…` (name plus a UUID); the
  secret shown once.
- Access log: 0, 20 and 5 000 entries; anonymous reads of public files
  are most of them.
- People & apps: 0 to 12 WebIDs, 1 to 40 items each.

## Constraints

- Everything in the [first brief's constraints](layout-brief.md#constraints):
  tokens only, phone first, at most four things per step and one primary
  action per screen, plain HTML and CSS, keyboard first, copy flagged not
  rewritten.
- **Provider code in its own module** (beside `src/lib/css-account.ts`),
  hidden for WebIDs from other providers.
- **A token or connector acts with its WebID's full access**: WAC cannot
  limit it to one app or one folder. The screen says so where one is
  made; the real limit is which folders the agent's WebID is granted.
- **Secrets are shown once and never stored**, not even in the browser.
- **Order of writes** (from the old backoffice, verified live):
  - new agent: write its document → give it public Read → read it back
    anonymously → link it to the account (answering the provider's
    ownership check by adding a token triple, then removing it); on
    failure, delete the document;
  - new pod: always pass your WebID as its owner (without it, the
    provider makes a new WebID nobody signs in as); never an empty name;
  - grant before telling: the folder is granted before the step says the
    agent can use it.

## Account API, as documented (CSS latest)

- Reached with the `css-account` cookie or `Authorization:
  CSS-Account-Token <value>`. The cookie's lifetime refreshes on each
  request.
- `controls.account.pod`: GET lists the account's pods; POST `{name,
  settings: {webId}}` creates one. A pod's own resource: GET gives its
  owners; POST `{webId, visible}` adds one, `{webId, remove: true}`
  removes one.
- `controls.account.webId`: GET lists linked WebIDs; POST `{webId}`
  links one (at once inside a pod the account created, otherwise after
  an ownership triple; on our provider, with one root storage, always
  after the triple); DELETE on a link unlinks.
- `controls.account.clientCredentials`: POST `{name, webId}` with a
  linked WebID; the secret comes back once; DELETE revokes.
- The Claude connector is ours, not CSS's: `/onboard/mint`, `grants`,
  `revoke` on the provider (pocpod0 `mcp-connector`).

## Open questions for the design session

1. **The account session.** Can the app reach `/.account/` with the
   cookie the provider set at sign-in (same site, CORS with credentials,
   as the old backoffice did from its own origin), or does D ask for the
   password again? Settled by a check before building; the answer
   decides whether You shows an "unlock account settings" step.
2. **Agents.** Each one a WebID under `agents/` on your pod, as before?
   What is "the back-link to its human" as a triple (the old app wrote
   none)? If it is protocol, it belongs in a solid-kit ADR.
3. **Lists.** Connectors and app tokens: one list or two? Pod owners:
   on each pod, or left out of D?
4. **People & apps.** Where the tab sits (the phone's bar holds three),
   and how "only the rules read so far" is shown.
5. **Access log.** Draw it and build it once Epic 9 lands, or leave it
   out of D's screens until then?

## Answers (27 Sep 2026), drawn on the canvas

Page "You · agents (D, first draft)":
[Backoffice layout](https://claude.ai/artifact/93WGYDxdEaB7DcyZBV4KVk).

- **D is agents on the pod you are signed in to.** Create an agent WebID
  (`agents/<name>#me`), connect Claude as it (one connector per agent),
  choose its folders, revoke the connector, delete the agent. Several
  pods on one account, pod owners and linking WebIDs across pods are out
  of D (it got messy in the old backoffice): CSS's own account page, or a
  later account app.
- **No rename.** Every grant names the agent's address; its name
  (`foaf:name`) may change, its address not. Renaming is deleting and
  creating. Deleting runs in order: revoke the connector, remove it from
  the rules found, from your `acl:delegates`, unlink, delete its document.
- **No app tokens, no owners in D.** A token for your own WebID is owner
  level; the connector already covers the need. Rare cases: CSS's page or
  a Claude session in pocpod0.
- **People & apps is not a tab.** Each agent shows what it can reach; a
  pod-wide "who has access" view may come later as an entry in Pods' side
  list, beside Followed. The phone bar stays two tabs (Pods,
  Collectives); the last live boards with three were fixed.
- **Access log dropped from D**: Epic 9 retires the reader-side approach.

- **The connector URL is the key.** claude.ai's custom connector sends
  only a URL, so the connector on the provider holds the agent's CSS
  credential and picks the agent by the random slug in `/mcp/<slug>`
  (pocpod0 `mcp-connector`, Story 8.3). Anyone with the URL acts as the
  agent until it is revoked: shown once, "keep it private"; lost means
  revoke and connect again.
- **Delete retires the address.** After revoking and removing grants,
  the agent's document stays without `solid:oidcIssuer` (nobody can sign
  in as it) and is unlinked; a new agent with the same name gets
  `<name>-2`, so rules the app never found cannot pass to it.
- **"May act for you" is ticked by default.**
- **Words**: step 2 is "Connect to AI", not "Connect Claude". The name
  heads the page; the full WebID sits above the profile's source.

- **Agents live in `profile/<name>#me`** from now on, beside `card`
  (reserved). Agents the old app made in `agents/` still show: the list
  comes from the account's linked WebIDs, not from a folder.
- **The account session is the cookie route**, which the old backoffice
  uses live.
- **One connector URL per organization in claude.ai**: adding a URL that
  already exists there is refused, so each agent's slug is its own
  connector.

**Later, provider work, not D: OAuth for the connector.** claude.ai now
supports OAuth (DCR or CIMD) for custom connectors
([Claude docs, authentication](https://claude.com/docs/connectors/building/authentication)).
Our connector uses "none": the secret is the URL's slug, which those docs
advise against. With OAuth, everyone adds the same URL, each person signs
in at pod.nicolasdb.eu and picks a linked WebID, and no secret sits in a
URL. The connector would have to refuse a person's own WebID: OAuth
changes who proves the identity, not what the identity may do, and a
connector acting as your own WebID gets owner access. D's step 2 would
then say "add this URL, sign in, pick the agent" instead of showing a
minted URL; agent creation and folders stay the same.

Open question 2's back-link (the mini handshake) is deferred to a later
stage (27 Sep 2026): the agent's address on your pod already says whose it
is, and nothing reads such a triple yet.

**Built (27 Sep 2026)** from these answers and the canvas, including a
second pass of the agent's card (canvas "An agent's card, second pass":
status, count, next step; folders one level down in Choose folders). What
was built and what is still open: [slices](slices.md), under D.

## Proposed order (superseded by the answers above)

1. **D1**: agents and "Let Claude use a folder" (the 7.16 evidence).
2. **D2**: connectors and app tokens (Dig).
3. **D3**: pods and their owners.
4. **D4**: People & apps.
5. **D5**: the access log, after the provider captures it (Epic 9.2).
