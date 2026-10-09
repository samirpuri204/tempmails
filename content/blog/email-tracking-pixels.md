# How email tracking pixels work, and why TempMails blocks remote images

An email tracking pixel is not a special technology. It is an ordinary remote image, usually one pixel square, whose URL is unique to the message it was sent in. When something requests that URL, the sender learns from the request. That is the whole mechanism, and understanding it takes about a minute: the image is a small HTML element, and the request is an ordinary HTTP request that carries a little information about where it came from. This article explains what a pixel can and cannot report, why the signal is weaker than the marketing suggests, and why blocking remote images — which is what this deployment does by default — is the one measure that actually breaks the chain.

## What a tracking pixel is

HTML email is a document, and like any other document it can reference resources on the web. The `<img>` element embeds an image, and the browser or email client fetches whatever its `src` attribute points to. MDN's reference documents both halves of that: the element embeds the image, and it notes that an empty `alt` attribute signals an image that is "not a key part of the content" — decoration, or a tracking pixel. The image can be invisible, cache-busting, and unique per recipient. Nothing about it needs to look like anything.

The second half is what the request carries. MDN's description of the `Referer` request header is blunt: it contains the absolute or partial address of the page that requested the resource, it allows a server to identify the referring page, and it carries the warning that the header "may have undesirable consequences for user security and privacy". A remote image in your message is exactly that situation: a request leaving your machine for someone else's server, tagged with context about where it came from.

## What the pixel actually reports

Put the two halves together and the report the sender receives is modest but real:

- **That the image was requested, and when.** This is read as "the message was opened", and it is the primary purpose of the pixel.
- **The requesting IP address.** From it, the sender can derive an approximate location — usually city-level at best, and wrong often enough to matter when the connection is a corporate network, a mobile carrier, or a VPN.
- **A client fingerprint.** The user agent string and any language or encoding headers travel with the request, which lets the sender guess the mail client, operating system, and device class. It is an impression, not a certain identification.
- **Whatever the URL already encoded.** A per-recipient token in the URL tells the sender which message, which campaign, and which address was involved. That is how a single pixel produces per-person open tracking without storing anything about you in the image itself.
- **Referrer context.** Where the request came from, as MDN describes, subject to the client's referrer policy.

Notice what is missing from that list: the content of your inbox. A pixel is a reporting beacon for the message it was embedded in, not a window into the rest of your mail.

## Why it is a weaker signal than it sounds

The usual claim is "the sender knows you opened the email". The mechanism only supports a narrower statement: an image was requested. Those are different facts, and the gap between them is where most pixel-based analytics quietly break down.

An open signal cannot tell a human from a machine. Anything that fetches the image produces it — a mail client that preloads images, a scanner, a security gateway, or a proxy that downloads remote content on your behalf. It cannot tell whether you read to the bottom, or whether you read the message at all before deleting it. It cannot tell a forward from an open, or two readers from one. And it fails silently in the other direction too: a reader who blocks remote images is invisible, which means the opens a sender measures are a subset of the opens that happened, weighted towards the readers who load images eagerly.

That is why "open rate" is best understood as an engagement estimate with a known bias, not a read receipt. Treat it the way you would treat any measurement taken without the reader's cooperation.

## The one habit that stops it

Remote images are fetched only if the client fetches them. Keep automatic image loading off and there is no request, so there is nothing to report. This is why deliberate image loading is the single control that matters, and why it is worth applying in every mail client, not just the disposable one.

On this deployment, remote images in a received message start blocked, and you can load them for a single message when you decide the sender is worth it. That is a configured behaviour rather than a cosmetic default: it exists so that reading a message does not, by itself, tell a stranger that you read it and roughly where you were. It is also described in the [privacy policy](/privacy), because it is a processing decision and not only a rendering one.

The practical rules are short. Leave images blocked for anything you did not expect, including a verification message from a site you do not recognise — a code is text, and it renders without images. Load them when you genuinely want to see the message, and accept that doing so discloses your connection to the image host. If a message looks broken without its images, that is not evidence it is safe to load them; a pixel is cheap to attach to something that looks like a newsletter.

**Why this matters more in a disposable inbox.** A pixel request does not read the address on the message; the message already carries what it needs, and the connection is what identifies the reader. Using a temporary address removes your permanent mailbox from a signup, but a loaded image still tells the sender's infrastructure roughly where the reader was. [Is temporary email safe?](/blog/is-temporary-email-safe) sets out the rest of that boundary, including the cases where a disposable inbox is the wrong tool entirely.

## What pixels are legitimately used for

It is worth being fair to the mechanism. Senders use open tracking to see whether a newsletter is being read, to stagger a mail stream, to detect dead addresses, and to measure whether their own deliverability is degrading. Those are ordinary operational questions. The problem is not that the measurement exists; it is that it is collected without consent, is less accurate than it is presented as being, and creates a record of when a specific person read a specific message. Blocking remote images is a proportionate response to that, not a rejection of email analytics as such.

## Frequently asked questions

**Can a sender tell whether I opened an email without a pixel?** Not from the message itself. Delivery and authentication record whether a message was accepted, not whether it was read. Some signals leak through replies, link clicks, or a bounce, but a message with all remote content blocked produces no read signal at all.

**Does loading images tell the sender my exact location?** No. It gives an IP address, from which an approximate location can be derived, often no better than a city and sometimes wrong. The connection is also visible to your own network provider, as described in [anonymous email](/anonymous-email).

**Is a plain-text email safer?** The mechanism needs a resource to fetch, and plain text carries none, so there is nothing to request. That is also why a verification code — digits, in the message body — works fine with remote images blocked.

**Do I need to block images in every client?** Yes, if you want the control to hold. The setting lives in each mail client and each webmail interface, and on this deployment remote images are blocked for received messages unless you load them for that message.
