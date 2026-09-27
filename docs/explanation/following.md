# Following

A reader for what others share with you: a folder a teammate opened to you,
a feed, a bundle, any address. It is the part of the backoffice that looks
outward, and it only reads.

The name follows platforms people already use: you *follow* an address and
can *unfollow* it. "Feeds" was the alternative; it fits RSS readers but not
a shared folder.

## What it does

- Add an address to follow. The app checks it can read it with your WebID
  before keeping it.
- A list with a title and a short excerpt for each, sorted by latest change
  or by favourites.
- Open one to see its content and details.
- Download, mark as favourite, unfollow.

What you follow, and your favourites, are stored on your own pod
(`settings/following.ttl`, [reference](../reference/following-file.md)), so
any app of yours can read the same list.

## What it reads, and when

Every read on someone else's pod may land in their access log, so the list
reads only your own pod: each entry keeps the title and excerpt you saw on
your last visit. An address is read twice in its life as an entry: once when
you follow it (to check your WebID can read it; nothing is kept otherwise),
and each time you open it. Inside a followed folder, rows show each item's
type and size from the folder's listing, not its first line: that would be
one more read per file on their pod.

## Links that open signed in

A pod address opened in a browser tab is read by nobody in particular: the
sign-in lives inside the app, not in a cookie the pod could see, so anything
that is not public answers "Not logged in". So the backoffice gives two
kinds of link instead:

- **Inside the app**, a link to something on your own pod opens it in Pods
  (your shared folder, on a collective's screen).
- **To send someone**, "Who can access it" offers a link to this backoffice,
  `…/?open=<address>`. Whoever opens it signs in if needed, then lands on
  the item read with their WebID, a "Follow it" button beside it; on their
  own pod, it opens in Pods. It survives the sign-in page the way an
  invitation does, and pasted into "Follow an address" it follows the
  address inside.

On our provider, a raw pod address could also send a browser to the
backoffice: that is the server's "default application", a provider
setting ([slices, D](../slices.md#d--provider-layer-shown-only-on-our-provider)).

## What it does not do

It never writes to someone else's pod, and it cannot list what is shared
with you: Solid has no way to ask "what may this WebID read". Someone has to
send you the address.

Every read on someone else's pod may appear in their access log. That is
intended.
