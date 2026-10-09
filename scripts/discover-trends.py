#!/usr/bin/env python3
"""
discover-trends.py - build a HUMAN REVIEW QUEUE from allowlisted RSS/Atom feeds.

WHAT THIS DOES
  Reads a fixed allowlist of public feeds published by organisations we already
  cite, extracts each item's title/link/date, scores it against topic keywords,
  and emits a queue for a human editor to triage.

WHAT THIS DOES NOT DO
  - It never publishes, schedules, drafts, or posts anything.
  - It does not write to a CMS or call any publishing API.
  - It does not crawl the open web: only the allowlisted feeds below are read.
  - It does not assume permission to republish feed content. Items are signals
    for triage only. The underlying primary source must be fetched and verified
    before any article is written, per docs/EDITORIAL.md.

USAGE
  python3 scripts/discover-trends.py                      # queue to stdout (JSON)
  python3 scripts/discover-trends.py --format markdown
  python3 scripts/discover-trends.py --list-feeds
  python3 scripts/discover-trends.py --only workspace-updates --min-score 3
  python3 scripts/discover-trends.py --selftest           # offline parser test

STDLIB ONLY. Python 3.8+.
"""

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

# ---------------------------------------------------------------------------
# Allowlist. Only these feeds are ever fetched. Each was confirmed by fetching
# the URL and parsing a valid RSS or Atom document.
# ---------------------------------------------------------------------------
ALLOWED_FEEDS = [
    {
        "id": "workspace-updates",
        "name": "Google Workspace Updates",
        "url": "https://workspaceupdates.googleblog.com/feeds/posts/default?alt=rss",
        "home": "https://workspaceupdates.googleblog.com/",
    },
    {
        "id": "google-security",
        "name": "Google Online Security Blog",
        "url": "https://security.googleblog.com/feeds/posts/default?alt=rss",
        "home": "https://security.googleblog.com/",
    },
    {
        "id": "malwarebytes",
        "name": "Malwarebytes Labs",
        "url": "https://www.malwarebytes.com/blog/feed",
        "home": "https://www.malwarebytes.com/blog",
    },
    {
        "id": "the-record",
        "name": "The Record",
        "url": "https://therecord.media/feed",
        "home": "https://therecord.media/",
    },
    {
        "id": "securityweek",
        "name": "SecurityWeek",
        "url": "https://www.securityweek.com/feed/",
        "home": "https://www.securityweek.com/",
    },
    {
        "id": "mozilla-blog",
        "name": "Mozilla Blog",
        "url": "https://blog.mozilla.org/feed/",
        "home": "https://blog.mozilla.org/",
    },
    {
        "id": "proton-blog",
        "name": "Proton Blog",
        "url": "https://proton.me/blog/feed",
        "home": "https://proton.me/blog",
    },
]

# Note: CISA's advisory feed was evaluated and removed from the allowlist because
# it returns HTTP 403 to non-browser clients, so it could not be confirmed as
# fetchable. Every feed above was fetched and parsed successfully.

# Weighted topic keywords. A keyword scores once per item.
KEYWORD_WEIGHTS = [
    (4, ["temporary email", "temp mail", "disposable email", "throwaway email",
         "email alias", "email aliases", "hide my email", "email mask",
         "email masking", "alias address"]),
    (3, ["phishing", "spoofing", "smishing", "spam", "deliverability",
         "credential theft", "supply chain", "supply-chain"]),
    (2, ["gmail", "google workspace", "outlook", "icloud", "apple account",
         "email privacy", "saml", "single sign-on", "breach", "data breach",
         "malware", "ransomware", "authentication"]),
    (1, ["email", "inbox", "mailbox", "spf", "dkim", "dmarc", "alias",
         "privacy", "security", "verification"]),
]

USER_AGENT = "TempMails-trends-bot/1.0 (+review queue only; no publishing)"
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------
def _local(tag):
    return tag.split("}")[-1].lower()


def _text(el):
    return WS_RE.sub(" ", "".join(el.itertext())).strip()


def _clean(text, limit=280):
    text = TAG_RE.sub(" ", text or "")
    text = WS_RE.sub(" ", text).strip()
    return text[:limit]


def _parse_date(value):
    """Return an ISO-8601 UTC string, or the raw value if unparsable."""
    value = (value or "").strip()
    if not value:
        return None
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        pass
    candidate = value.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(candidate)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except ValueError:
        return value


def parse_feed(raw, feed):
    """Parse an RSS 2.0, RSS 1.0/RDF, or Atom document into item dicts."""
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    if not raw.lstrip().startswith("<"):
        return []
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        return []

    items = []
    for el in root.iter():
        kind = _local(el.tag)
        if kind not in ("item", "entry"):
            continue

        title = link = date = summary = ""
        for child in list(el):
            name = _local(child.tag)
            if name == "title":
                title = _text(child)
            elif name == "link":
                if kind == "entry":
                    rel = child.get("rel", "alternate")
                    href = child.get("href", "")
                    if href and rel == "alternate":
                        link = href  # an explicit alternate always wins
                    elif href and not link and rel not in ("replies", "self", "edit"):
                        link = href
                else:
                    link = _text(child) or link
            elif name in ("pubdate", "published", "updated", "date", "created"):
                date = date or _text(child)
            elif name in ("description", "summary", "content"):
                summary = summary or _text(child)

        if not title and not link:
            continue
        items.append({
            "title": _clean(title, 200),
            "url": link.strip(),
            "publishedAt": _parse_date(date),
            "excerpt": _clean(summary, 240),
            "source": feed["name"],
            "sourceId": feed["id"],
            "sourceHome": feed["home"],
        })
    return items


def score_item(item):
    haystack = " ".join([item.get("title", ""), item.get("excerpt", "")]).lower()
    score = 0
    matched = []
    for weight, keywords in KEYWORD_WEIGHTS:
        for kw in keywords:
            if kw in haystack:
                score += weight
                matched.append(kw)
    item["relevanceScore"] = score
    item["matchedKeywords"] = sorted(set(matched))
    return item


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------
def fetch(url, timeout):
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.1",
        "Accept-Encoding": "identity",
    })
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(4_000_000)


# ---------------------------------------------------------------------------
# Queue construction
# ---------------------------------------------------------------------------
def build_queue(feeds, timeout, min_score, limit):
    items, checked, errors = [], [], []
    for feed in feeds:
        entry = {"sourceId": feed["id"], "source": feed["name"], "url": feed["url"]}
        try:
            raw = fetch(feed["url"], timeout)
            parsed = parse_feed(raw, feed)
            entry["items"] = len(parsed)
            checked.append(entry)
            items.extend(parsed)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
            entry["error"] = "%s: %s" % (type(exc).__name__, exc)
            errors.append(entry)

    for item in items:
        score_item(item)

    queue = [i for i in items if i["relevanceScore"] >= min_score]
    queue.sort(key=lambda i: (i["relevanceScore"], i["publishedAt"] or ""), reverse=True)

    for item in queue:
        item["status"] = "pending_human_review"
        item["autoPublish"] = False

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "review_queue_only",
        "autoPublish": False,
        "publishingDisabled": True,
        "note": (
            "Signals only. Feed content is NOT licensed for republication; fetch and "
            "verify the primary source before writing. A human reviews and publishes."
        ),
        "minScore": min_score,
        "feedsChecked": checked,
        "feedErrors": errors,
        "itemCount": len(queue[:limit]),
        "items": queue[:limit],
    }


def render_markdown(report):
    lines = [
        "# Trend review queue",
        "",
        "Generated: %s" % report["generatedAt"],
        "Mode: review queue only. Nothing here is published automatically.",
        "",
        "| Score | Title | Source | Published | Link |",
        "| --- | --- | --- | --- | --- |",
    ]
    for item in report["items"]:
        title = item["title"].replace("|", "/")
        lines.append("| %s | %s | %s | %s | %s |" % (
            item["relevanceScore"], title, item["source"],
            item["publishedAt"] or "unknown", item["url"] or "-",
        ))
    if report["feedErrors"]:
        lines += ["", "## Feed errors", ""]
        for err in report["feedErrors"]:
            lines.append("- %s (%s): %s" % (err["source"], err["sourceId"], err.get("error")))
    lines += ["", "> Human review required before any use. Do not republish feed content."]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Offline self-test
# ---------------------------------------------------------------------------
SAMPLE_RSS = """<?xml version="1.0"?>
<rss version="2.0"><channel><title>Sample</title>
<item><title>New temporary email alias guidance for Gmail users</title>
<link>https://example.com/a</link>
<pubDate>Tue, 15 Sep 2026 10:00:00 GMT</pubDate>
<description>Phishing and privacy notes about email aliases.</description></item>
</channel></rss>"""

SAMPLE_ATOM = """<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Sample Atom</title>
<entry><title>Brevo SAML SSO incident write-up</title>
<link rel="alternate" href="https://example.com/b"/>
<updated>2026-09-10T06:30:00Z</updated>
<summary>Supply chain phishing through a marketing platform.</summary></entry>
</feed>"""


def selftest():
    feed = {"id": "selftest", "name": "Self test", "url": "memory://", "home": "memory://"}
    failures = []

    rss_items = parse_feed(SAMPLE_RSS, feed)
    if len(rss_items) != 1:
        failures.append("RSS: expected 1 item, got %d" % len(rss_items))
    else:
        item = score_item(rss_items[0])
        if item["url"] != "https://example.com/a":
            failures.append("RSS: link not parsed")
        if not item["publishedAt"].startswith("2026-09-15"):
            failures.append("RSS: date not normalised (%s)" % item["publishedAt"])
        if item["relevanceScore"] < 4:
            failures.append("RSS: score too low (%d)" % item["relevanceScore"])

    # An Atom entry often lists rel="replies" before rel="alternate"; the
    # alternate (the article itself) must win.
    sample_with_replies = SAMPLE_ATOM.replace(
        '<link rel="alternate" href="https://example.com/b"/>',
        '<link rel="replies" href="https://example.com/b/comments"/>'
        '<link rel="alternate" href="https://example.com/b"/>',
    )
    replies_items = parse_feed(sample_with_replies, feed)
    if len(replies_items) == 1 and replies_items[0]["url"] != "https://example.com/b":
        failures.append("Atom: alternate link lost to replies link (%s)" % replies_items[0]["url"])

    atom_items = parse_feed(SAMPLE_ATOM, feed)
    if len(atom_items) != 1:
        failures.append("Atom: expected 1 item, got %d" % len(atom_items))
    else:
        item = score_item(atom_items[0])
        if item["url"] != "https://example.com/b":
            failures.append("Atom: alternate link not parsed")
        if not (item["publishedAt"] or "").startswith("2026-09-10"):
            failures.append("Atom: updated date not normalised (%s)" % item["publishedAt"])

    if parse_feed("not xml at all", feed):
        failures.append("Malformed input should yield no items")

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "selftest", "autoPublish": False, "publishingDisabled": True,
        "passed": not failures, "failures": failures,
        "feeds": [f["id"] for f in ALLOWED_FEEDS],
    }
    print(json.dumps(report, indent=2))
    return 0 if not failures else 1


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Build a human review queue from allowlisted feeds.")
    ap.add_argument("--format", choices=["json", "markdown"], default="json")
    ap.add_argument("--only", action="append", default=None,
                    help="Limit to a feed id (repeatable).")
    ap.add_argument("--min-score", type=int, default=3)
    ap.add_argument("--limit", type=int, default=40)
    ap.add_argument("--timeout", type=float, default=15.0)
    ap.add_argument("--out", default=None,
                    help="Write the queue to this path. Default: stdout only.")
    ap.add_argument("--list-feeds", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if args.list_feeds:
        print(json.dumps(ALLOWED_FEEDS, indent=2))
        return 0

    feeds = ALLOWED_FEEDS
    if args.only:
        wanted = {x.strip().lower() for x in args.only}
        feeds = [f for f in ALLOWED_FEEDS if f["id"].lower() in wanted]
        if not feeds:
            print("No allowlisted feed matched --only. Use --list-feeds.", file=sys.stderr)
            return 2

    report = build_queue(feeds, args.timeout, args.min_score, args.limit)
    output = render_markdown(report) if args.format == "markdown" else json.dumps(report, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(output + "\n")
        print("Wrote review queue (%d items) to %s" % (report["itemCount"], args.out))
    else:
        print(output)

    # Review queue only: always exit 0 so a scheduler never treats "no news" as failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
