# Set up a collective's pod

For whoever runs the collective, once, by hand. The backoffice does not do
this. You need the collective's own account, and a tool that can write
files and `.acl` documents on its pod.

1. **Create the account** for the collective on the provider, like a person's.
2. **Upload `config.ttl`** at the pod root, adapted from
   [`examples/hyperscope-config.ttl`](../examples/hyperscope-config.ttl).
3. **Let anyone signed in read it.** Upload `config.ttl.acl` next to it
   (replace the owner WebID):

   ```turtle
   @prefix acl: <http://www.w3.org/ns/auth/acl#> .

   <#owner> a acl:Authorization ;
       acl:agent <https://pod.nicolasdb.eu/hyperscope/profile/card#me> ;
       acl:accessTo <config.ttl> ;
       acl:mode acl:Read, acl:Write, acl:Control .

   <#applicants> a acl:Authorization ;
       acl:agentClass acl:AuthenticatedAgent ;
       acl:accessTo <config.ttl> ;
       acl:mode acl:Read .
   ```

   Upload it as `text/turtle`; a server may refuse an `.acl` sent as plain
   text. If your tools cannot write an `.acl` by hand, making `config.ttl`
   public also works: it holds nothing secret. It only lets anonymous
   visitors read it too.
4. **Create `membres.ttl`** at the pod root, with only `foaf:member` lines
   ([example](../examples/hyperscope-membres.ttl)). Give each member Read on
   it as you accept them.
5. **Create `inbox/`** and give `acl:AuthenticatedAgent` Append on it, with
   `acl:default` so it applies to what is inside.
6. **Check** by signing in to the backoffice as an unrelated account and
   opening the invitation link: the collective's card appears, and
   `membres.ttl` stays unreadable.
7. **Invite** with
   `https://<backoffice>/?collective=https://<pod>/<collective>/config.ttl`.

The rights for the other containers (`depots/`, `principles/`, …) are listed
in [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
