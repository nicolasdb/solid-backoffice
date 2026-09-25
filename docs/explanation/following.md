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

What you follow, and your favourites, are stored on your own pod, so any app
of yours can read the same list.

## What it does not do

It never writes to someone else's pod, and it cannot list what is shared
with you: Solid has no way to ask "what may this WebID read". Someone has to
send you the address.

Every read on someone else's pod may appear in their access log. That is
intended.
