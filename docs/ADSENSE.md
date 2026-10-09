# Google AdSense

The root layout includes `<meta name="google-adsense-account" content="ca-pub-3624892885273135">` in the head of every HTML page. This is the publisher verification tag; it does not itself display ads or confirm Google approval.

`/ads.txt` is served by `app/ads.txt/route.ts` with the matching DIRECT authorization line (`google.com, pub-3624892885273135, DIRECT, f08c47fec0942fa0`), so programmatic buyers can verify the account. If the publisher ID ever changes, update it in `layout.tsx`, `components/adsense-slot.tsx`, and `app/ads.txt/route.ts` together.

## Configure placements

In AdSense, create responsive display ad units. Copy each numeric `data-ad-slot` value from the provided ad code.

Open `/admin` → Website settings:

- **Adsense top slot**: homepage *primary* unit — after the inbox card and safety note, before "Your real inbox stays yours". (The key name is historical; nothing is placed above the generator.)
- **Adsense bottom slot**: homepage *footer* unit — after the guide/FAQ, before the footer. Desktop only; hidden under 700 px so mobile never shows two ads.
- **Adsense content slot**: footer of public articles and informational pages.
- **Adsense enabled**: enables requests for configured units.

Paste slot IDs only, not HTML or JavaScript. Publisher ID is already configured. A blank slot renders nothing at all — there is no placeholder. AdSense scripts are loaded only when a valid slot is configured and the enable switch is on. Admin pages do not display ad units. Placement rules live in `docs/MONETIZATION.md`.

Save changes and refresh the public page. Google approval, ad availability, browser blockers, and applicable consent setup can affect whether an ad is served. Configure any required privacy/consent messages in your AdSense account before enabling live ads, and update the site's privacy disclosures to reflect Google advertising.

The inbox application continues working if the ad script is blocked. Never click your own ads for testing.

## "Low value content" policy violation (26 Sep 2026)

AdSense rejected the site for **low value content**, which asks for "substantial unique value", a consistent presence, and sustained user interest. The cause was measurable rather than mysterious: 17 public pages held **4,557 words between them**, an average of 268 words, with eight pages under 260. A tool wrapped in paragraph-length pages reads as thin no matter how useful the tool is.

### What was changed

Every page carrying under roughly 450 words was rewritten with material specific to this service rather than generic temp-mail filler. The corpus went from **4,557 to 12,707 words** across the same 17 pages.

| Page | Before | After | Added |
| --- | --- | --- | --- |
| `/faq` | 156 | 1025 | 11 Q&As plus the three things that actually confuse people |
| `/anonymous-email` | 181 | 969 | separates what a temp address hides from what it does not |
| `/temporary-email` | 233 | 965 | the decision test, and the sending limits |
| `/how-it-works` | 195 | 916 | inbox lifecycle, why delivery fails, why expiry is the feature |
| `/about` | 183 | 892 | who operates the service, the editorial process, how it is funded |
| `/privacy` | 336 | 891 | cookie table, provider-by-provider retention, backup limits |
| `/temporary-email-for-verification` | 173 | 874 | the four reasons a code does not arrive, and the order that avoids them |
| `/acceptable-use` | 148 | 869 | concrete permitted/prohibited list with rationale |
| `/disposable-email` | 160 | 823 | why sites block these domains, and what disposable does not mean |
| `/10-minute-mail` | 180 | 782 | what a short window is and is not enough for |
| `/contact` | 119 | 718 | what to include, what never to send, what cannot be recovered |
| `/terms` | 254 | 621 | sending behaviour, the footer, the reply path, limits of the service |

The five guides (`/how-to-choose-a-temp-mail-service` and the four alongside it) sit at 415-616 words and were **not** expanded. They are the next thing to deepen if a second rejection arrives.

### Editing page copy: the database wins

**This is the trap that made the first attempt look like it had failed.** `getPage()` in `lib/content-data.ts` looks up the `seoPage` table first and only falls back to `lib/content.ts` when a slug has no row. All 17 pages have rows, so every one of them is served from Postgres and **ignores the TypeScript entirely**. Rewriting `lib/content.ts` and deploying changes nothing a visitor can see.

The order of operations for any page-copy change is therefore:

1. Edit the prose (see the next section for how it is staged).
2. `python3 seo-audit/content-rewrite/inject.py` — splices it into `lib/content.ts`, keeping the static fallback in sync.
3. `npx tsx seo-audit/content-rewrite/sync-db.mts` — pushes title, description, body and faqs into `seoPage` for every slug that has a row, after writing the previous rows to `backup-seopage.json`.

Step 3 is a live content update and needs **no redeploy**, because the row is read per request. Skipping step 3 is silent: the build succeeds, the alias moves, and the site keeps serving the old text. Verify with a rendered word count on the live page, never by assuming the deploy did it.

### Where the prose lives

Page bodies still ship from `lib/content.ts` and `lib/seo-guides.ts`, but they were written as Markdown and spliced in by `seo-audit/content-rewrite/inject.py`, so the prose stays readable and the TypeScript escaping is done by a script rather than by hand. The staged Markdown and the FAQ sets are in `seo-audit/content-rewrite/`.

The injector refuses to write unless every article it touches matched exactly once, so a silent no-op is impossible. Note that Python's `re.sub` expands escapes in a *replacement string* — the FAQ form uses a lambda for that reason, and the body form does too, because `\n` in a replacement string would become a real newline and break the single-line TS literal.

Three constraints in the existing tests must survive any further rewrite of these pages. `tests/editorial.test.tsx` asserts that `privacy` and `terms` never regain the pre-launch template phrases, that `temporary-email` still mentions the **sending** feature, and that every in-content internal link resolves to a real slug. A rewrite that drops the sending mention will fail the suite.

### Not a guarantee

This removes the measurable cause of the rejection. It does not guarantee approval — low value content is a judgement about the site as a whole, and a temporary-mail service competes in a category Google sees a great deal of. If it is rejected again, the honest next steps are the five remaining guides, a steadier publishing cadence on the journal, and original material no other temp-mail site publishes, such as measured deliverability data. Not more words.
