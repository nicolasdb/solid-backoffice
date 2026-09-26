# Set up a collective's pod

For whoever runs the collective, once, by hand. The backoffice does not do
this. You need the collective's own account, and a tool that can write
files and `.acl` documents on its pod.

1. **Create the account** for the collective on the provider, like a person's.
2. **Upload `config.ttl`** at the pod root, adapted from
   [`examples/hyperscope-config.ttl`](../examples/hyperscope-config.ttl).
3. **Make it public.** Upload `config.ttl.acl` next to it
   (replace the owner WebID):

   ```turtle
   @prefix acl:  <http://www.w3.org/ns/auth/acl#> .
   @prefix foaf: <http://xmlns.com/foaf/0.1/> .

   <#owner> a acl:Authorization ;
       acl:agent <https://pod.nicolasdb.eu/hyperscope/profile/card#me> ;
       acl:accessTo <config.ttl> ;
       acl:mode acl:Read, acl:Write, acl:Control .

   <#public> a acl:Authorization ;
       acl:agentClass foaf:Agent ;
       acl:accessTo <config.ttl> ;
       acl:mode acl:Read .
   ```

   Upload it as `text/turtle`; a server may refuse an `.acl` sent as plain
   text. Public, because the invitation's welcome screen reads it before
   anyone signs in ([why](../reference/collective-files.md#configttl)). It
   holds nothing secret.
4. **Create `membres.ttl`** at the pod root, with only `foaf:member` lines
   ([example](../examples/hyperscope-membres.ttl)). Give each member Read on
   it as you accept them.
5. **Create `inbox/`** and give `acl:AuthenticatedAgent` Append on it, with
   `acl:default` so it applies to what is inside.
6. **Check** by signing in to the backoffice as an unrelated account and
   opening the invitation link: the collective's card appears, and
   `membres.ttl` stays unreadable.
7. **Invite** by sending the invitation link, copied from the collective's
   tab in the backoffice ([invite people](invite-people.md)):
   `https://<backoffice>/?collective=https://<pod>/<collective>/config.ttl`.
   Opened, it shows the invited welcome; pasted into "Join another
   collective" by someone already signed in, it finds the collective.

The rights for the other containers (`depots/`, `principles/`, …) are listed
in [ADR 006 §5](https://github.com/nicolasdb/solid-kit/blob/main/docs/adr/006-membership-and-publication-by-pull.md).
