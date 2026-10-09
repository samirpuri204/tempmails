# When you should not use temporary email

Every article about disposable inboxes, including the ones on this site, spends its words on what temporary email is good for. This one is the counterpart: the list of things it should not be used for, written plainly, because the failure cases are the expensive ones. The rule behind the list fits in a sentence. **If you will ever need to come back to it — to log in, to prove a purchase, to reset a password, to find a document — the address has to be one you keep.** Everything below is a version of that rule.

## The one-line test

Ask a single question before you type a temporary address into a form: if this inbox vanished tonight, what would I lose? If the answer is "nothing", a disposable address is a reasonable choice. If the answer names an account, a payment, a booking, a document, or a person who will need to reach you later, you have found a case for a permanent address.

## Payments, receipts and purchases

Order confirmations, invoices, refund threads, warranty claims, delivery notifications, and tickets all share one property: they arrive later than the moment you signed up. A refund may be confirmed in a week. A warranty claim may be filed in two years. A delivery notice arrives the day you are not home.

None of that can reach an inbox that expired, and the retention window on this deployment is measured in minutes, not months: a default of 60 minutes with an operator-configured maximum of 1440 minutes. Use a real address for anything that involves money changing hands, and treat "I'll just screen the spam later" as the cheaper option.

## Identity checks and anything that has to be true about you

Government identifiers, age verification, tax or immigration correspondence, financial account openings, and insurance all depend on an address that will still exist when someone needs to verify it. Using a throwaway inbox there is not a clever workaround; it is a way to end up unable to prove a fact about yourself at the moment it matters. On this deployment, the [terms of service](/terms) say the same thing from the other side: the service is not designed for records you must retain, and you are responsible for choosing an appropriate permanent address for important accounts.

## Account recovery and second factors

This is the failure that cannot be repaired. Password reset flows send a link to the address on the account. If that address no longer exists, the recovery link lands nowhere, and support desks rarely accept "I used a disposable address" as proof of ownership.

The same applies to a second factor or a login code you will need in three months, and to the address you nominate as the recovery route for another account. If a service offers to send a backup code to an address, that address is part of your identity there. Do not point it at something designed to expire.

## Anything with a person on the other end

Support threads, landlord and employer correspondence, school and medical communication, and anything a human will reply to days later belong on a durable address. A temporary inbox works if the reply arrives while the inbox is open. It stops working the moment the conversation continues on someone else's schedule, and there is no way to tell an automated sender from a human one until it is too late.

## Messages you may need to read again

A confirmation number, a booking reference, a licence key, a receipt for a tax return, or the terms of something you agreed to. Even when no account is involved, some messages are documents. Keep those where they will still be readable, and remember that a temporary inbox has no export you can rely on.

## When you need to send rather than receive

Disposable inboxes are mostly receiving tools, and outbound sending where it is enabled on this deployment is deliberately limited: plain text of at most 4000 characters, a cap of five sends per inbox per hour, abuse checks, a branded footer identifying the message as sent from a temporary address, and a reply-to pointing back at the temporary address — which only works while it is still alive. That is enough for a spot check of your own flow. It is not a channel for correspondence, applications, disputes, or anything a recipient may quote back to you.

## When a message carries a file

Attachments are served on this deployment only when the operator has configured a malware scanner; otherwise the feature is off. If the message you are expecting has a file in it, that is usually a sign the transaction is not disposable: contracts, tickets, statements, and records of employment all travel as attachments.

## When you need an address that hides you but lasts

There is a middle option between a throwaway inbox and giving out your personal address, and it fits exactly the cases above. Address-masking tools generate an address that forwards to a mailbox you keep: Apple's Hide My Email generates unique, random addresses that forward to your personal inbox, and Proton documents additional addresses and hide-my-email aliases used as separate identities within one account. Neither expires on a timer, so both are suitable for accounts you must be able to recover — which is precisely what a disposable inbox is not. [Temporary email vs. email aliases](/blog/temporary-email-vs-email-aliases) compares the two approaches in more detail.

| Situation | Use a temporary inbox? | Better choice |
|---|---|---|
| One-off download, coupon, or trial you will not return to | Yes | — |
| A signup you may revisit within the day | Usually not | A second real mailbox, or an alias |
| Anything involving payment, warranty, or a receipt | No | Alias or permanent address |
| Account recovery, 2FA, or a nominated backup address | No | Permanent or alias you control |
| Identity verification, tax, medical, legal, employment | No | Permanent address |
| Support thread with a person | No | Permanent or alias you control |
| Your own QA test of an email flow | Yes | — |

## Frequently asked questions

**What happens if I use a temporary address for an account and later lose the inbox?** The reset link has nowhere to arrive, and the account becomes effectively unrecoverable. Support may help if you have other proof, and may not. This is the reason the recommended uses exclude anything you plan to keep.

**Can I extend the inbox to buy time?** Time can be extended within the operator's configured maximum, which is 1440 minutes on this deployment, and only while the inbox is still active. That is minutes, not months, so it does not convert a disposable inbox into a durable one.

**Is it acceptable for a subscription trial I intend to cancel?** Only if the cancellation does not depend on mail you receive later. If the trial requires a receipt, a confirmation, or a cancellation link sent by email, use an address you keep — otherwise you may find the trial harder to leave than to join.

**I only want to stop marketing email. Do I need a disposable inbox at all?** Not necessarily. An alias keeps marketing out of your main inbox and still lets the sender reach you for the messages that matter, which is often the better trade-off. See [temporary email vs. email aliases](/blog/temporary-email-vs-email-aliases).
