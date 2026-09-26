# Invite people to a collective

For the account that runs a collective, once its pod is set up
([set up a collective](set-up-a-collective.md)).

## The invitation link

An invitation link is the backoffice's own address followed by
`?collective=` and the address of the collective's `config.ttl`:

```
https://<the backoffice>/?collective=https://<pod>/<collective>/config.ttl
```

For HyperScope on the test copy:

```
https://test.nicolasdb.eu/?collective=https://pod.nicolasdb.eu/hyperscope/config.ttl
```

You do not have to write it by hand: sign in as the collective, open its tab,
and click the link under its name to copy it. On `localhost` the link points
to your development server, so it works only on that computer (fine for
trying it in a private window, useless to send).

Send it however you like (mail, chat, a page on your website). What it does:

- **Opened by someone signed out**, it shows the invited welcome page, with
  "Create your account" first and "Sign in instead" one click away. After
  signing in, their home screen offers "Ask to join".
- **Pasted by someone already signed in**, into "Join another collective" on
  their home screen, it finds the same collective. The bare `config.ttl`
  address works there too.

Without an invitation, `/` alone shows the backoffice's own welcome page,
which says that joining starts with a collective's invitation link.

## The collective's own welcome words (optional)

The invited welcome page has a title and a paragraph at the top. By default
both are the backoffice's words, written in `src/welcome.ts`:

> **Your work stays yours.**
> HyperScope invited you. Joining starts with a pod: …

The collective can replace them with its own by adding two lines to its
`config.ttl`, next to `foaf:name`, **and the `@prefix schema:` line at the
top** (without it the file is no longer valid Turtle, and the backoffice
refuses the whole collective, naming the missing line):

```turtle
@prefix schema: <http://schema.org/> .

<#hyperscope> a hs:Collective ;
    foaf:name "HyperScope" ;
    schema:slogan "Look closer, together." ;
    schema:description "A collective of people who read slowly and share what they find." ;
    …
```

- `schema:slogan` replaces the title.
- `schema:description` replaces the paragraph under it.

Either one can be used alone. Everything else on the page (why, how it works,
the collective's folder, the form) stays the backoffice's. The words are read
from `config.ttl` each time someone opens the link, so a change shows on the
next visit, with no code change and no deploy. If either line appears twice,
the page ignores it and uses its own words. Details:
[collective files, welcome copy](../reference/collective-files.md#welcome-copy).
