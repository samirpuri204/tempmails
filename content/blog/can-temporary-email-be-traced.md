# Can temporary email be traced? What each party can actually see

"Can it be traced?" is the wrong shape of question, because there is no single place where the answer lives. A visit to a website that asks for an email address leaves traces in at least four independent systems, and each one holds a different piece of the picture. Some of those pieces expire in minutes. Some are held by organisations that were never involved in the signup at all. The useful answer is a map of the layers — and it is worth being direct about the conclusion up front: a temporary address removes your permanent mailbox from a signup, and it does not make the connection anonymous. [Anonymous email](/anonymous-email) explains why the category cannot promise that.

## Layer 1: the temporary email service

This is the layer people usually mean, so here is exactly what this deployment holds. According to the [privacy policy](/privacy), it processes your temporary address, the messages you receive, outbound message contents and delivery records when sending is enabled, permitted attachments, and creation and expiry times. When sending is enabled, messages are capped at 4000 plain-text characters and five sends per inbox per hour, with abuse checks applied. The terms state that the service is not designed for records you must retain.

For abuse prevention it stores:

- **A keyed hash of network identifiers** — a one-way signature computed with the application's secret, not the address in readable form. It exists so that rate limits and creation limits can be counted per source without keeping the source itself. Because the hash depends on the secret, it cannot be reversed by anyone who steals the store; someone holding a candidate address can only test it by computing the same signature.
- **A pseudonymous device cookie**, which keeps limits attached to a browser rather than to a person.
- **Address tombstones**: one-way records that stop an expired address being handed to someone else.

The honest limits are as important as the list. Nothing there is used for advertising or profiling, message contents are not an advertising input, and expired inboxes become inaccessible immediately and are removed by scheduled cleanup. But operationally, an inbox is not deleted the instant it expires: cleanup runs on a schedule, and infrastructure providers — hosting, database, mail routing, queue, and security providers — keep their own logs with their own retention periods, which the policy says do not necessarily follow the inbox countdown. Any claim that a temporary address leaves no trace at all is false. The accurate claim is that the traces are short-lived, pseudonymous, and not for sale.

## Layer 2: the site you signed up to

The website you used the address on is the layer that most often holds something identifying, and it is outside the temporary service's control entirely. It received your disposable address because you typed it in. It also received the normal information that accompanies any request: the address itself, the referrer context described in MDN's documentation of the `Referer` header — which notes both that a server can identify the referring page and that this header has privacy consequences — plus whatever you entered in the rest of the form.

That last part is the one that actually matters. If you put your name, phone number, or a delivery address into the form, the address you used is irrelevant to what the site knows: the disposable inbox protected your mailbox, not your identity. If you later log in and use the account, everything you do there is associated with that account, and the disposable address is simply the identifier attached to it.

## Layer 3: your network

Whatever device you used made a network connection, and someone else operates that path. Your internet provider sees that a connection was made to a particular service at a particular time, even when the traffic is encrypted; a corporate or campus network may see considerably more; a mobile carrier holds the session records for the subscriber. This layer is untouched by anything you do with email addresses, and it is also the layer that can re-identify a connection months later, subject to that operator's own retention rules. This is the technical reason temporary email and anonymity are different products, and it is the same reason a VPN changes which network can see the connection rather than whether a connection exists.

## Layer 4: the mail path

Messages you receive arrived through mail infrastructure: the sender's server, the receiving service's inbound routing, and the queue between them. Those systems process delivery metadata as a matter of course, and on this deployment they are operated by the providers named in the privacy policy, whose infrastructure logs and backups may have separate retention periods. Mail can also carry a branded footer and a reply-to pointing at the temporary address when you send from it, which is intentional: a recipient should be able to tell that the message came from a temporary address.

## What "tracing" would actually require

Put the layers together and a realistic description of traceability looks like this. To connect a disposable address to a person, someone would need records from more than one layer: the service's pseudonymous hash and timestamps, the destination site's own account and form data, and network-level records from the provider whose connection carried the traffic. No single one of those completes the picture, and the shorter-lived layers may be gone by the time anyone asks. That is a meaningful reduction in exposure compared with giving your permanent address to every site you touch. It is not unknowability.

Two practical consequences follow. First, deleting an inbox removes your access immediately, and does not promise immediate erasure from infrastructure backups — the policy says so plainly. Second, the honest positioning of a service like this one is "not designed for records you must retain", not "nothing is recorded". Read the [privacy policy](/privacy) as the source of truth for processing, and treat any service that promises total untraceability as misrepresenting how networks work.

## Habits that reduce what the layers can hold

- **Do not reuse one disposable address across services.** Reuse is what turns a throwaway identifier into a profile.
- **Keep real details out of the form and the message.** The strongest identifying information in almost every case is what you typed, not which inbox received the reply.
- **Leave remote images blocked.** Loading one discloses your connection to the image host, which is a report about you rather than about the address. See [how email tracking pixels work](/blog/email-tracking-pixels).
- **Do not use a disposable inbox for accounts you will log into repeatedly**, where the address becomes an account identifier you cannot recover. [When not to use temporary email](/blog/when-not-to-use-temporary-email) covers that boundary.
- **Understand what your network can see**, and what changes if you use a different one. This is the layer you cannot fix with an email address.

## Frequently asked questions

**Does the service store my IP address?** It stores a keyed hash of it, used for per-source rate limits, plus a pseudonymous device cookie. The hash is one-way and cannot be read back as an address.

**Can the site I signed up to find my real email address?** Not from the disposable address you gave it. It can only learn an address you supplied or clicked through with. It does have its own record of the request, and whatever you entered in the form.

**Is temporary email anonymous, then?** No. It keeps your permanent address out of a signup. [Anonymous email](/anonymous-email) sets out the parts it cannot hide, and [is temporary email safe](/blog/is-temporary-email-safe) covers the practical risk.

**Does deleting the inbox erase everything?** It ends your access immediately, and expired inboxes are removed by scheduled cleanup. Infrastructure provider logs and backups may have separate retention periods, and the privacy policy explicitly does not promise immediate erasure from backups.
