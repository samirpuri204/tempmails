# Is temporary email safe? A threat model, not a verdict

"Is temp mail safe?" is usually asked as a yes-or-no question, and that is why the answers online are useless: a disposable inbox is safe for the thing it was built for and unsafe when it is stretched into a permanent identity. This article sets out the threat model rather than a verdict. It separates what a temporary address genuinely protects against — list resale, exposure of your everyday inbox, a signup you will never revisit — from what it does not, including network-level identification, the records the destination site keeps, and the failure modes that cause real damage. Every product statement below describes the limits this deployment is configured with, not a universal guarantee, and the honest summary is in [why temporary email is not anonymity](/anonymous-email).

## What a temporary address actually protects

A disposable inbox solves one problem well: it keeps your permanent address out of a transaction that does not need it. If a site sells its mailing list, leaks it, or starts sending daily promotions, none of that reaches the mailbox you use for work, banking, or family. If you never return to the site, there is nothing of yours left behind to correlate — no account, no password you have to remember, no address that follows you to the next hundred services.

That is the same instinct behind mainstream address-masking tools, and it is worth understanding how they differ, because the difference is durability, not privacy level. Apple's Hide My Email, for example, generates unique, random addresses that forward to your personal inbox, and Apple states that only the app or website you created the account with can use that address to reach you, with messages deleted from its relay servers after delivery, usually within seconds. Proton's documentation describes additional addresses and hide-my-email aliases in similar terms: separate identities that keep the real address private while mail still arrives in a mailbox you keep. Those tools are designed for accounts you intend to keep. A disposable inbox is designed for one you do not — and on this deployment it expires, defaulting to a 60-minute window with an operator-configured maximum of 1440 minutes. Read the countdown shown in the interface rather than assuming a number, because retention is a configuration choice.

## What it does not protect against

**Network-level identification.** The address is disposable; the connection is not. Your internet provider, the network you are on, and the site you are connecting to can each process connection information regardless of which address you typed into the form. [Anonymous email](/anonymous-email) explains this in more detail, and it is the single most common misunderstanding about the entire category.

**The destination site's records.** The site you signed up to keeps whatever it keeps: the data you entered, its own logs, and any cookies it set. Using a throwaway address changes what you hand over, not what the site records.

**Anyone who can reach the inbox.** Access on this deployment is bound to a private browser cookie, with an optional recovery token you are told to keep private. There is no password in front of it. Someone using the same browser profile, or anyone you hand your recovery token to, can read the messages. Treat the inbox as observable rather than secret.

**Remote images and links.** Images in a received message start blocked, and on this deployment they stay blocked unless you explicitly load them, because fetching one can disclose your IP address to the image host. [Email tracking pixels](/blog/email-tracking-pixels) covers what those requests report.

**Phishing aimed at you.** The FTC's guidance describes the pattern plainly: scam messages impersonate a company you trust, often claiming suspicious activity or a problem with your account, to get you to click a link, open an attachment, or hand over passwords, account numbers, or identifying details. A disposable address does not verify who sent a message. The sender field in a received email is a claim, not a proof, and this applies equally to a throwaway inbox and a corporate one.

**Attachments.** On this deployment, attachments are available only when the operator has enabled a malware scanner; otherwise the feature is off. If a message has to carry a file, that is a signal that the transaction was not a throwaway one.

## The failure modes that actually cause harm

Almost every story about temporary email going wrong fits one of five shapes.

**Using it for an account you need to keep.** Account recovery runs through the address on file. When the inbox expires, the reset link has nowhere to go, and you cannot recover the account. This is the failure that cannot be undone, and it is why the service's own terms rule out banking, payments, identity verification, and account recovery. [When not to use temporary email](/blog/when-not-to-use-temporary-email) lists the cases in full.

**Reusing one address across services.** A disposable address loses most of its value the second time you use it. Two sites that both hold the same address can be joined by anyone who ends up holding both lists, and an address that appears in several signups looks less like a throwaway and more like an identity.

**Opening remote content reflexively.** Loading images or tapping links in an unexpected message is how the inbox you were protecting becomes the thing that identifies you. Keep remote images blocked unless you recognise the sender and expect the message.

**Putting sensitive data in the form or the message.** Never paste card details, government identifiers, medical information, API keys, or anything else you would not want read by a stranger into a disposable inbox. The [privacy policy](/privacy) describes how message content is handled and retained; it does not offer confidentiality, and none should be assumed.

**Assuming the address is untraceable.** The service keeps a keyed hash of network identifiers for abuse prevention, a pseudonymous device cookie, creation and expiry times, and message records for the life of the inbox. That is aggregate-oriented and not used for advertising, but it is data. [Can temporary email be traced?](/blog/can-temporary-email-be-traced) walks through what each party can see.

## A safe-use checklist

- Use one fresh address per signup, and never the same one twice.
- Never use it for anything you must access later: an account, a purchase, a warranty, a booking, or a subscription you intend to keep.
- Treat every message as readable by someone other than you, and send nothing confidential into it or from it.
- Leave remote images blocked unless you trust the sender, and do not click links in unexpected mail.
- Prefer an alias or a real mailbox when the account needs to survive: Apple and Proton both document exactly that use case.
- Delete the inbox when you are done, or let it expire, rather than leaving it open in a tab you will forget about.
- Check what the countdown says before you start. Message your code, not your life.

The short version: temporary email is safe for short-lived, low-stakes, non-sensitive tasks, and unsafe the moment you ask it to hold identity, money, or recovery. That is not a flaw in the category. It is the boundary of what it was built to do.

## Frequently asked questions

**Is temporary email anonymous?** No. It keeps your permanent address out of a signup, while your connection still carries information that the site and your network provider can process. See [anonymous email](/anonymous-email) for the details.

**Can a website see my real email address?** It sees the disposable address you typed and the connection data behind the request. It does not see the mailbox you normally use, unless you put that address or your real name in the form yourself.

**Is it safe for one-off downloads, coupons, or trial signups?** Generally yes, provided you expect nothing to survive: no receipts you need later, no support thread, no account you plan to return to.

**Does it protect me in a data breach?** Partially, and only for one class of breach. If a marketing list is exposed, the leaked address is one that expires and is worth little. If the breach is at a site that holds payment or identity data about you, the address you used changes nothing about that exposure.

**What is the safest alternative when I need something lasting?** An address-masking alias or a second real mailbox, as documented by Apple and Proton, or a dedicated address for a single purpose that you actually control. Then read [temporary email vs. email aliases](/blog/temporary-email-vs-email-aliases) for how to choose between them.
