// Each guide answers a distinct question; spelling variants share the homepage.
export const seoGuides = {
  "how-long-does-temp-mail-last": {
    title: "How Long Does a Temp Mail Address Last?",
    description:
      "Temporary email lifespan explained: the countdown, what ends access, how Extend time works, the maximum lifetime, and how to keep an inbox available longer.",
    body: "A temporary email address lasts exactly as long as the countdown shown above it. On TempMails the operator sets the starting duration and a hard maximum lifetime; the timer on your inbox page is the only authoritative expiry time. Nothing in this guide overrides it.\n\n## What the countdown means\nWhile the countdown is running, the address accepts new mail and you can read everything it has received. When it reaches zero, two things happen at once: new messages are rejected and browser access stops. A scheduled cleanup job later deletes the stored messages, attachments, and access tokens. There is no grace period after zero.\n\n## Typical lifetimes\nServices in this category usually fall into three bands: about ten minutes for a single verification code, an hour for a signup that needs a follow-up email, or a day for a task you return to. TempMails supports durations across that range, capped at a maximum the operator configures (up to seven days). The homepage countdown tells you which band your current address is in.\n\n## How to keep a temp mail address longer\nUse the Extend time control before the countdown reaches zero. Each extension adds time up to the configured maximum lifetime; once the maximum is reached the button stops being offered. Refreshing the page does not add time, and creating a new address does not carry over the old one. If you need the address in another browser or device, save the recovery token shown at creation—it restores access to an inbox that is still active.\n\n## What ends an address early\nDeleting the inbox yourself, an abuse-control action by the operator, or clearing the browser cookie without a saved recovery token all end access before the timer does. Late mail sent after any of these cannot be recovered.\n\n## When a longer life is the wrong tool\nIf you expect a website to email you again in weeks or months—password resets, receipts, account confirmations—no temporary lifetime is long enough. Use a permanent mailbox or a persistent alias instead. See the comparison in Temporary email vs email alias.",
    faqs: [
      {
        question: "How long does a temp mail address last on TempMails?",
        answer:
          "As long as the countdown on your inbox page shows. The operator sets the starting duration; extensions are available up to a configured maximum lifetime of at most seven days.",
      },
      {
        question: "Can I keep a temporary email address for longer?",
        answer:
          "Yes, while the inbox is active. Use Extend time before the timer reaches zero. Each extension adds time until the maximum lifetime is reached.",
      },
      {
        question: "Does refreshing the page reset the timer?",
        answer:
          "No. Refresh only checks for new messages. Only Extend time changes the expiry.",
      },
      {
        question: "What happens to emails that arrive after expiry?",
        answer:
          "They are rejected. The address stops accepting mail the moment the countdown ends, and stored messages are removed by cleanup afterward.",
      },
    ],
  },
  "how-to-choose-a-temp-mail-service": {
    title: "How to Choose a Temp Mail Service: 8 Checks",
    description:
      "A checklist for comparing temporary email services: inbox lifetime, extension rules, registration, delivery reliability, privacy handling, attachments, mobile use, and abuse policy.",
    body: "Temporary email services look alike on the surface—an address, a countdown, an inbox—but they differ in the details that decide whether a message actually reaches you and who else can read it. Use these eight checks to compare any service, including this one.\n\n## 1. Inbox lifetime and extension\nFind out how long an address lives and whether you can extend it before it expires. A fixed ten minutes suits one verification code; a signup with a follow-up email needs an hour or more. On TempMails the countdown is shown on the inbox and Extend time is available up to an operator-defined maximum. See How long does a temp mail address last.\n\n## 2. No registration required\nA temporary address that asks for your real email defeats the purpose. Confirm that an address is issued without an account. TempMails creates one immediately, subject to a security check and rate limits.\n\n## 3. Where your mail can be read\nSome services publish inboxes openly so anyone who guesses an address can read it. Others tie access to a private cookie or token. Check which model a service uses before receiving anything you would not want public. TempMails binds access to a private browser cookie and an optional recovery token.\n\n## 4. Delivery reliability\nNo temporary email service can force a sender to accept its domains; many websites block known disposable domains. Look for a service that offers more than one domain, and read its troubleshooting guidance for missing mail. If a code does not arrive, the problem is usually sender-side—see Temp mail not receiving emails.\n\n## 5. Privacy handling\nRead the privacy policy for three things: whether message contents are used for advertising or profiling, whether remote images and tracking pixels load automatically, and how long data is kept after expiry. TempMails blocks remote images by default and does not use message contents for advertising; details are in the Privacy policy.\n\n## 6. Attachments and formatted mail\nCheck whether attachments are delivered and whether they are scanned. A service that shows raw HTML with scripts intact is a risk. TempMails shows a sanitized formatted view and only serves attachments when malware scanning is configured.\n\n## 7. Works on your phone\nIf you mostly sign up from a mobile browser, test the service there. You need to copy the address with one tap and see new mail without reloading. TempMails is a responsive web app; no install is required on Android or iOS.\n\n## 8. Abuse policy and limits\nA clear acceptable-use policy and visible rate limits protect legitimate users because they keep the service's domains from being blocked. Services with no stated policy tend to lose deliverability quickly. TempMails publishes its Acceptable use policy and a Report abuse control on every message.\n\n## Making the decision\nFor a single code, any service passing checks 2 to 4 is adequate. For anything you will return to within a day, insist on checks 1 and 3 as well. For accounts you must keep, do not use a temporary address at all.",
    faqs: [
      {
        question: "What is the most important feature in a temp mail service?",
        answer:
          "Delivery reliability. A temporary address is only useful if the sender accepts it and the message arrives while the inbox is active. Lifetime and private access come next.",
      },
      {
        question: "Are free temp mail services safe to use?",
        answer:
          "For non-sensitive, short-term tasks, yes, provided inbox access is private and the service does not load remote content automatically. Never use any temporary address for banking, payments, or account recovery.",
      },
      {
        question: "Do I need to install an app for temp mail on mobile?",
        answer:
          "No. A responsive web service such as TempMails works in the mobile browser on Android and iOS without installation.",
      },
    ],
  },
  "temp-mail-not-receiving-emails": {
    title: "Temp Mail Not Receiving Emails? Fixes to Try",
    description:
      "Check a missing temporary email step by step: address spelling, inbox expiry, sender restrictions, resends, and when to use a permanent address.",
    body: "A temporary inbox can be open and working even when an expected message has not arrived. Delivery involves the sending website, its email provider, and the receiving service. Start with the checks below before creating another address.\n\n## 1. Match the full recipient address\nCopy the address directly from your inbox and compare it with the address shown by the sending website. A missing letter or a different domain sends mail somewhere else. If you selected New address after requesting the email, the sender may still be using your previous address.\n\n## 2. Check the countdown\nMail must arrive while the inbox is active. Refresh checks for messages but does not extend the timer. Use Extend time before expiry when available. An expired or deleted inbox cannot be recovered, and generating a new address does not restore old messages.\n\n## 3. Check what the sender actually confirmed\nA form accepting an address is not proof that an email was sent. Look for an error beside the field or a confirmation on the website. Some senders reject disposable email domains, and others queue messages. TempMails cannot override a sender’s acceptance policy.\n\n## 4. Refresh and resend carefully\nKeep the inbox open and use Refresh to check its latest state. If the sender offers a resend option, wait for its stated cooldown and request one resend. Repeated requests may trigger limits or invalidate earlier verification codes. Use the newest message if several eventually arrive.\n\n## 5. Separate display problems from delivery problems\nIf the page reports a connection error, reload it in the same browser so its access cookie is preserved. Do not clear browser data unless you have saved the active inbox’s recovery token. A message that appears in the list but has blocked images has arrived; remote images are a separate privacy control.\n\n## When to choose another address\nUse a permanent mailbox when an account must remain accessible, the sender does not accept disposable addresses, or the message is important enough that you need long-term support. Temporary email should not hold purchase records, financial messages, or password recovery for lasting accounts.",
    faqs: [
      {
        question: "Does clicking Refresh extend my temp mail address?",
        answer:
          "No. Refresh checks for new messages. Request an extension before the countdown reaches zero if the option is available.",
      },
      {
        question: "Will changing the address recover a missing code?",
        answer:
          "No. A new address receives only messages sent to that address. Update the recipient on the sending website before requesting a new code.",
      },
      {
        question: "Can TempMails guarantee a verification email will arrive?",
        answer:
          "No. The sender must accept the address and deliver while it is active. Provider delays and sender restrictions can prevent delivery.",
      },
    ],
  },
  "temporary-email-vs-email-alias": {
    title: "Temporary Email vs Email Alias: Which to Use",
    description:
      "Compare a disposable inbox, an email alias, and a permanent mailbox by lifespan, forwarding, recovery, and the kind of account you need.",
    body: "A temporary inbox and an email alias both help you avoid sharing your primary address directly, but they solve different problems. Decide whether you need one message now or reliable communication over time.\n\n## How a temporary inbox works\nTempMails creates a separate temporary inbox with an expiry countdown; the operator may also allow short plain-text replies from it. You read messages on this website rather than in your permanent mailbox. Access belongs to the browser holding the private cookie or to someone with the recovery token. When the inbox expires, continued access and new delivery stop.\n\n## How an email alias works\nAn alias is an alternative address that usually forwards mail into an existing mailbox. Depending on the provider, you may disable an alias, reply through it, or keep it indefinitely. The destination mailbox still needs strong authentication, and alias features vary by service. An alias does not automatically delete your received messages.\n\n## Choose by the task\nFor a one-time resource or a short email test, a disposable inbox can keep follow-up mail out of your personal account. For an ongoing newsletter, a customer account, or correspondence you may need later, a persistent alias is often a better fit. For banking, purchases, and account recovery, use a durable, secured address that you control.\n\n## Understand recovery before you sign up\nA website may ask you to confirm the same email months later. A temporary address that has expired cannot help at that point. Saving a TempMails recovery token only restores access to an active inbox; it does not turn the address into a permanent mailbox.\n\n## Compare privacy honestly\nBoth approaches involve providers processing messages. Neither makes every online action anonymous. The website you visit can still see information about your session, and email can contain identifying details. Consider the sender, the message sensitivity, and the provider’s policy instead of assuming that hiding your main address removes every privacy risk.\n\n## A simple decision\nIf losing the address tomorrow would lock you out of something important, choose a permanent mailbox or a lasting alias. If the task ends after one non-sensitive email and disposable addresses are accepted, temporary email may be enough.",
    faqs: [
      {
        question: "Does TempMails forward messages to my personal inbox?",
        answer:
          "No. Read incoming messages directly in the temporary inbox. TempMails does not require your personal email address to create an inbox.",
      },
      {
        question: "Is burner email another name for temporary email?",
        answer:
          "Often, yes. Check the actual expiry and access rules of the service instead of relying on the name alone.",
      },
    ],
  },
  "temporary-email-for-testing": {
    title: "Temporary Email for Testing Signup Flows",
    description:
      "Use a temporary inbox to manually test an email workflow you own. Check recipients, codes, formatting, expiry, and duplicate-message behavior.",
    body: "A disposable inbox is useful for a small manual test of an email flow you own or are authorized to test. It lets you inspect a real received message without mixing test traffic into your everyday inbox. TempMails is not a load-testing or bulk-account-creation tool.\n\n## Prepare a controlled test\nUse staging or a test account where possible. Create a fresh temporary address, note its countdown, and copy the full address into your application. Use synthetic names and harmless content. Never send real customer records, payment details, or production secrets to a disposable inbox.\n\n## Verify the recipient and arrival\nTrigger one message. Confirm that the recipient in your application matches the generated address and that the received sender and subject are expected. A successful form submission alone does not prove delivery. If the message does not arrive, inspect your own provider’s delivery logs and use the troubleshooting guide before resending.\n\n## Inspect the message people will read\nCheck the plain-text version, the sanitized formatted view, and whether a code is legible on a small screen. Remote images start blocked; make sure essential instructions remain understandable without them. This view is not a substitute for compatibility testing across Gmail, Outlook, and other clients.\n\n## Test codes and links deliberately\nIn your own test environment, confirm that a valid code succeeds, an incorrect code fails, and an expired code cannot be reused. If your application sends another code, check the intended behavior of older messages. Avoid clicking unfamiliar links or testing systems you do not control.\n\n## Record results without private access tokens\nRecord the test case, time, expected result, and observed result. Keep the temporary address and message content out of public bug reports when they reveal information about your test system. Do not include the recovery token, access cookie, or screenshots of credentials.\n\n## Finish and choose the right tool for larger tests\nDelete the inbox when the test is finished or let it expire. For automated suites or high-volume email tests, use an approved email sandbox or provider testing feature with explicit limits. TempMails uses rate limits and a security check; bypassing them is not a supported testing workflow.",
    faqs: [
      {
        question: "Can I use TempMails to test an application I own?",
        answer:
          "Yes, for authorized, non-sensitive manual email tests within the service limits. Use an email sandbox for automated or high-volume testing.",
      },
      {
        question: "Does the formatted view reproduce every email client?",
        answer:
          "No. TempMails sanitizes HTML for display. Test separately in the email clients your users rely on.",
      },
    ],
  },
};
