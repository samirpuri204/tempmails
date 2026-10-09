# Editorial policy and sourcing standard

This document describes how content under `content/blog/` is researched, checked, reviewed, and published. It applies to every article referenced by `content/blog/manifest.json` and to any future additions. The short version: a human reviews and publishes, machines only prepare.

## 1. No automatic publishing

Nothing in this repository publishes itself.

- `content/blog/*.md` and `content/blog/manifest.json` are **drafts and metadata**, not a publication step.
- `scripts/discover-trends.py` **only** produces a review queue. It never writes to a CMS, never calls a publishing API, and never schedules a post.
- `publishedAt` and `reviewedAt` remain `null` in the manifest until a human has actually published or reviewed the piece. An agent must not fill in a date to imply an event that has not happened.
- Promoting a draft to a live post is a deliberate, human action performed outside these scripts.

If a workflow ever appears to publish on its own, treat that as a defect and stop the pipeline.

## 2. Human review before publication

Every article is read by a person before it goes live. The reviewer confirms, at minimum:

- The title and description match the body and are not clickbait.
- Claims are traceable to the sources recorded in the manifest.
- Anything attributed to a third party is attributed accurately, not paraphrased into a stronger statement.
- Product statements about TempMails match the actual, current configuration.
- Nothing in the piece promises anonymity, security, or permanence that the service does not provide.

Publication is blocked until this review is recorded.

## 3. Primary sources first

Research proceeds from the strongest available source outward.

1. **Primary sources first.** Official documentation, vendor support articles, status pages, standards bodies, and the organisation that experienced an incident. If Google documents a change, cite Google. If a company publishes an incident write-up, cite that company.
2. **Secondary sources to confirm and contextualise.** Reputable reporting may be used to corroborate, to add detail the primary source omits, or to describe impact on named parties. Secondary sources do not replace the primary source when one exists.
3. **Nothing invented.** No fabricated statistics, no invented quotes, no plausible-sounding numbers, no speculation about causes or figures that have not been disclosed. If the primary source does not state a number, the article does not state it either.
4. **Attribution discipline.** "According to Brevo's write-up" is preferred over a bare assertion. Where a claim rests on reporting rather than an official statement, say so. Where a rollout timeline comes from coverage citing an official post, label it as reported detail from that post.

## 4. Source checking procedure

Before an article is considered ready:

- Every factual claim maps to a source in the manifest `sources` array.
- Each source URL is fetched and confirmed to load and to actually contain the claim (not merely a headline that matches).
- A source that cannot be opened is either replaced or removed, along with any claim that depended on it.
- Dates are stated exactly as the source states them, including time zones where the source gives them.
- Quoted or closely paraphrased material is checked against the source wording.
- Where sources disagree, the article prefers the primary source and notes the discrepancy rather than picking the more dramatic version.

## 5. Accuracy and corrections

- Being current is not a reason to be wrong. A dated or developing story is published only after its claims are checked against a primary source, and it is labelled so readers can see what is confirmed.
- If a claim cannot be verified, two options exist: drop it, or attribute it precisely to whoever made it and state that it is unconfirmed. It is never presented as established fact.
- Corrections are made in the open at the top of the affected article or the article is withdrawn. Silent edits that change meaning are not acceptable.
- Time-sensitive articles (rollouts, deadlines, incidents) carry the date they were checked, so a reader can judge how stale the information is.

## 6. Safety and responsible scope

- Articles about phishing, breaches, or fraud explain how to verify and stay safe; they do not provide instructions that would help an attacker.
- Incident coverage attributes claims to sources and avoids speculation, blame beyond what is documented, and estimates of harm that nobody has confirmed.
- No article encourages fraud, impersonation, harassment, bulk account creation, or evasion of another service's safeguards.
- Temporary email is described accurately: as a convenience for short-lived, non-sensitive tasks. Articles must not present it as anonymous, secure, or suitable for banking, payments, identity, or account recovery.
- Consumer-protection and privacy claims are limited to what the product actually documents.

## 7. Product statements

- Settings are described as **configured limits**, not permanent defaults. Where the product's behaviour depends on an operator's configuration (retention window, sending availability, attachment scanning, rate limits), the article says so explicitly.
- The following facts are stated as configuration on the deployment in question, not as universal guarantees: retention default of 60 minutes with a maximum of 1440 minutes; attachments disabled unless a scanner is enabled; restricted outbound plain text of at most 4000 characters; a limit of five sends per inbox per hour; CAPTCHA and blocklists applied; a branded footer identifying messages as sent from a temporary address; and replies directed to the temporary address.
- Articles must not imply that the service provides account identity, anonymity, or security guarantees, and must repeat that it is not intended for banking or account recovery.
- Internal links are limited to paths that actually exist: the homepage `/`, the paths listed in `contentLinks` (`lib/content-registry.ts`), the guide slugs defined in `lib/content.ts`, and `/blog/<slug>` for slugs present in this manifest. `contentLinks` currently covers `/blog`, `/temporary-email`, `/how-it-works`, `/temp-mail-not-receiving-emails`, `/temporary-email-vs-email-alias`, `/temporary-email-for-testing`, `/about`, `/contact`, `/privacy`, `/terms`, and `/acceptable-use`; the test suite checks that every listed path resolves, so add a path to the registry only when the page exists.

## 8. Trending topics and feeds

- `scripts/discover-trends.py` reads an explicit allowlist of feeds published by organisations we already cite. It does not crawl the open web.
- A feed item is a **signal**, not a source. Before anything is written, the underlying primary source is fetched and checked.
- Reading a public RSS/Atom feed does **not** grant permission to republish its content. Feed items are used only to decide what a human should look into; we do not copy headlines, summaries, or article text into our own output, and we do not assume syndication or republication rights we have not been given.
- The queue produced by the script is advisory. It records title, link, source, and a relevance score for human triage, and it is discarded once reviewed.

## 9. Authorship

- Articles are attributed to `TempMails` as the publisher. No individual author names, biographies, credentials, or expertise claims are invented.
- If a named human author is ever added, that person must have actually written and reviewed the piece.

## 10. Draft preparation check

Before a draft goes to a human for review, run both of these. They are mechanical checks, not a substitute for reading the piece.

- `npm test` — the editorial suite asserts that every manifest entry has a matching file, that the file's first line is exactly the manifest title, that every relative link resolves to a page or a manifest slug, and that sources are https with no embedded credentials.
- `node --import tsx scripts/_check-journal-drafts.ts` — renders every draft through the same component the journal uses and prints its structure (words, headings, tables, links). A draft that renders no `<table>` while containing a table, or leaves `**` markers in the output, has a markup mistake the reader would have seen.
- `node --import tsx scripts/sync-content.ts` (dry run, no `--apply`) — parses every manifest entry against `postSchema` and reports which posts would be written, and which stay drafts. A schema failure here is a failure that would otherwise surface during a live sync.

## 11. Review checklist

Before publication, confirm each of the following:

1. A human has read the full draft.
2. Every claim traces to a listed source, and every listed source was fetched and checked.
3. Primary sources are cited where they exist.
4. Any unconfirmed claim is attributed and labelled as such.
5. Product limits are described as configured, not as permanent defaults.
6. No promise of anonymity, security, or permanence appears anywhere.
7. Internal links resolve to existing paths or manifest slugs.
8. `publishedAt` and `reviewedAt` are set only after the corresponding real-world action.
9. No placeholder text, unfinished section, or template marker remains.
