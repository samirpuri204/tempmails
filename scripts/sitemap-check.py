"""Check public crawler documents and every listed URL on production."""
import concurrent.futures
import json
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

BASE = 'https://tempmails.live'
NS = '{http://www.sitemaps.org/schemas/sitemap/0.9}'

def fetch(path, cookie=False):
    headers = {'User-Agent': 'Googlebot'}
    if cookie:
        headers['Cookie'] = 'tm_inbox=sitemap-regression-check'
    with urllib.request.urlopen(urllib.request.Request(BASE + path, headers=headers), timeout=40) as r:
        body = r.read()
        assert r.status == 200 and r.url == BASE + path, (path, r.status, r.url)
        return body, dict(r.headers)

results = []
for path, root in [('/sitemap.xml', 'urlset'), ('/sitemap-index.xml', 'sitemapindex')]:
    for cookie in [False, True]:
        body, headers = fetch(path, cookie)
        parsed = ET.fromstring(body)
        assert parsed.tag == NS + root
        lower = {k.lower(): v for k, v in headers.items()}
        assert 'application/xml' in lower.get('content-type', '')
        assert 'noindex' not in lower.get('x-robots-tag', '')
        assert 'private' not in lower.get('cache-control', '')
        results.append({'path': path, 'inboxCookie': cookie, 'status': 200, 'xmlRoot': root})

body, _ = fetch('/sitemap-index.xml')
assert [e.text for e in ET.fromstring(body).iter(NS + 'loc')] == [BASE + '/sitemap.xml']
body, _ = fetch('/sitemap.xml')
urls = [e.text for e in ET.fromstring(body).iter(NS + 'loc')]
assert len(urls) == len(set(urls)) and len(urls) > 1
assert all(u.startswith(BASE + '/') for u in urls)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(lambda u: fetch(u[len(BASE):]), urls))
robots, _ = fetch('/robots.txt')
assert b'Sitemap: https://tempmails.live/sitemap.xml' in robots
assert b'Disallow: /\n' not in robots
report = {'documents': results, 'publicPagesChecked': len(urls), 'passed': True}
Path('docs/seo/sitemap-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
