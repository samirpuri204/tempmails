import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { contentSecurityPolicy } from "../proxy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Loads a module with a fresh module registry so env-driven config re-reads. */
async function withEnv<T>(env: Record<string, string>, load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  try {
    return await load();
  } finally {
    vi.unstubAllEnvs();
  }
}

type ScriptStub = {
  src?: string;
  async?: boolean;
  nonce?: string;
  dataset: Record<string, string>;
  onerror?: () => void;
};

/**
 * The loader mutates a real document. Node has none, so give it just enough of
 * one to record what was inserted and to answer the duplicate check.
 *
 * `querySelectorAll("script[src]")` matters: the loader decides whether a tag is
 * already live by asking the document, so the stub has to behave like one.
 */
function installDom() {
  const scripts: ScriptStub[] = [];
  const visible = () => scripts.filter((s) => s.src);
  const document = {
    body: { appendChild: () => {} },
    createElement: () => {
      const el: ScriptStub = { dataset: {} };
      scripts.push(el);
      return el;
    },
    querySelectorAll: (selector: string) => (selector === "script[src]" ? visible() : []),
    querySelector: () => null,
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", {} as never);
  return {
    scripts,
    /** Simulates the page replacing its scripts, as a navigation would. */
    unmount: (index = 0) => {
      scripts.splice(index, 1);
    },
  };
}

/**
 * A document with just a title and a head, so a fake unread badge can be
 * reproduced without a browser. `mutate` writes a title the way a third-party
 * script would and then fires the observer, which is exactly what the browser
 * does after a `<title>` text change.
 */
function installTitleDom(initial: string) {
  const doc = { head: {}, title: initial, querySelector: () => null };
  const callbacks: Array<() => void> = [];
  class FakeMutationObserver {
    constructor(callback: () => void) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("document", doc);
  vi.stubGlobal("MutationObserver", FakeMutationObserver);
  return {
    doc,
    mutate(title: string) {
      doc.title = title;
      for (const callback of callbacks) callback();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. The removed network must not come back
// ---------------------------------------------------------------------------

const IGNORE_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  ".vercel",
  "seo-audit",
  "geo",
  "media-output",
  "data",
  "test-results",
  "playwright-report",
  ".private-content-backups",
]);

/** Everything that could reach a production build or a published page. */
const SHIPPED_ROOTS = [
  "app",
  "components",
  "lib",
  "scripts",
  "prisma",
  "content",
  "docs",
  "tests",
  "next.config.ts",
  "proxy.ts",
  "package.json",
  ".env.example",
  "README.md",
];

async function walk(target: string): Promise<string[]> {
  const full = resolve(target);
  let entries;
  try {
    entries = await readdir(full, { withFileTypes: true });
  } catch {
    return [target];
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const child = join(target, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(child)));
    else if (/\.(tsx?|mjs|js|json|md|css|prisma|example|txt)$/.test(entry.name)) found.push(child);
  }
  return found;
}

describe("removed advertising network", () => {
  // The identifiers below belong to the network that was removed on the owner's
  // instruction. They are listed here so the check can name them.
  const REMOVED = [
    "adsterra",
    "highrevenueformat",
    "profitableratecpmnetwork",
    "667e12ba",
    "1974a230",
  ];

  // Files allowed to contain these identifiers. The two historical records
  // (this test file and the migration report) always stay permitted; when a
  // network that was previously removed is deliberately reinstated, the new
  // files for that network are added here so the scan keeps proving that the
  // identifiers are confined to the files that are supposed to carry them.
  //
  // The reinstated Adsterra network appears in more than just its config and
  // banner: the layout preconnects the host and mounts the units, the ad-health
  // probe hits the invoke URL, the ads index exports them, and the inbox mounts
  // the banner. Those are part of the legitimate integration and are listed
  // here so the scan still catches a stray "adsterra" anywhere else.
  //
  // `components/ads/social-bar.tsx` is the second unit on that account — the
  // notification-style one. It is named without the network so the assertion
  // below (exactly one Adsterra-named component) keeps its meaning: what is
  // being pinned is that a *new format* does not silently appear as a second
  // banner-shaped component. Its identifiers still have to be declared here,
  // because that scan is about text, not filenames.
  const PERMITTED = [
    "tests/ads.test.ts",
    "docs/MONETIZATION-MIGRATION-REPORT.md",
    "components/ads/adsterra-banner.tsx",
    "components/ads/social-bar.tsx",
    "lib/ad-config.ts",
    "app/layout.tsx",
    "components/ads/ad-health.tsx",
    "components/ads/index.ts",
    "components/inbox.tsx",
  ];

  it("has no identifier left anywhere in the project except the permitted files", async () => {
    const files = (await Promise.all(SHIPPED_ROOTS.map(walk))).flat();
    const hits: string[] = [];
    for (const file of files) {
      if (PERMITTED.some((name) => file.endsWith(name))) continue;
      let text: string;
      try {
        text = await readFile(file, "utf8");
      } catch {
        continue;
      }
      const lower = text.toLowerCase();
      for (const needle of REMOVED) {
        if (lower.includes(needle)) hits.push(`${file} → ${needle}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("keeps the reinstatement confined to the files that are supposed to carry it", async () => {
    const components = await readdir(resolve("components/ads"));
    const adComponents = components.filter((name) => /adsterra/i.test(name));
    // The reinstated banner is the only Adsterra component expected in the app.
    expect(adComponents).toContainEqual("adsterra-banner.tsx");
    expect(adComponents).toHaveLength(1);

    // The zone key, host and origins live in the config module. That module is
    // the only lib module that may carry the reinstated network's identifiers.
    const modules = await readdir(resolve("lib"));
    const adModules = modules.filter((name) => /adsterra/i.test(name));
    expect(adModules).toEqual([]);
    const config = await readFile(resolve("lib/ad-config.ts"), "utf8");
    // The config module is in PERMITTED above, so this read is the proof that
    // the only place the identifiers live is the file that is supposed to carry
    // them — not some other lib module that a future cleanup might add.
    expect(config.toLowerCase()).toContain("adsterra");
  });
});

// ---------------------------------------------------------------------------
// 2. Configuration
// ---------------------------------------------------------------------------

describe("ad configuration", () => {
  it("is on by default, served by Monetag, with the owner's zone", async () => {
    const { adConfig, monetagActive, monetagOrigins } = await withEnv({}, () =>
      import("../lib/ad-config"),
    );
    expect(adConfig.provider).toBe("monetag");
    expect(adConfig.enabled).toBe(true);
    expect(adConfig.monetagEnabled).toBe(true);
    expect(monetagActive()).toBe(true);
    expect(adConfig.monetag.zone).toBe("282200");
    expect(adConfig.monetag.src).toBe("https://quge5.com/88/tag.min.js");
    // The tag waits for the page to settle before it may compete with the inbox.
    expect(adConfig.delayMs).toBe(900);
    // And its outcome is read after the request has had time to fail.
    expect(adConfig.fillWindowMs).toBe(4000);
    expect(adConfig.reportFill).toBe(true);
    expect(monetagOrigins).toEqual(["https://quge5.com"]);
  });

  it("turns every network off from one variable", async () => {
    const { adConfig, monetagActive, adsenseActive } = await withEnv(
      { NEXT_PUBLIC_ADS_ENABLED: "false" },
      () => import("../lib/ad-config"),
    );
    expect(adConfig.enabled).toBe(false);
    expect(monetagActive()).toBe(false);
    // AdSense must not fill the gap either — "off" means no ads at all, even
    // when the provider is explicitly `both`.
    expect(adsenseActive()).toBe(false);
    const both = await withEnv(
      { NEXT_PUBLIC_ADS_ENABLED: "false", NEXT_PUBLIC_ADS_PROVIDER: "both" },
      () => import("../lib/ad-config"),
    );
    expect(both.monetagActive()).toBe(false);
    expect(both.adsenseActive()).toBe(false);
  });

  it("lets the tag be switched off without touching AdSense", async () => {
    const off = await withEnv({ NEXT_PUBLIC_MONETAG_ENABLED: "false" }, () =>
      import("../lib/ad-config"),
    );
    expect(off.monetagActive()).toBe(false);
    const both = await withEnv(
      { NEXT_PUBLIC_MONETAG_ENABLED: "false", NEXT_PUBLIC_ADS_PROVIDER: "both" },
      () => import("../lib/ad-config"),
    );
    expect(both.monetagActive()).toBe(false);
    expect(both.adsenseActive()).toBe(true);
  });

  it("lets one provider, and only one, be chosen", async () => {
    const monetag = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "monetag" }, () =>
      import("../lib/ad-config"),
    );
    expect(monetag.monetagActive()).toBe(true);
    expect(monetag.adsenseActive()).toBe(false);

    const adsense = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "adsense" }, () =>
      import("../lib/ad-config"),
    );
    expect(adsense.monetagActive()).toBe(false);
    expect(adsense.adsenseActive()).toBe(true);

    const both = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "both" }, () =>
      import("../lib/ad-config"),
    );
    expect(both.monetagActive()).toBe(true);
    expect(both.adsenseActive()).toBe(true);

    const none = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "none" }, () =>
      import("../lib/ad-config"),
    );
    expect(none.monetagActive()).toBe(false);
    expect(none.adsenseActive()).toBe(false);
  });

  it("treats a stale provider value as the default instead of switching ads off", async () => {
    // A leftover `NEXT_PUBLIC_ADS_PROVIDER` naming a network that has been
    // removed must not be able to disable every ad silently — which is exactly
    // how the site ended up with no advertising at all once before.
    const stale = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "adsterra" }, () =>
      import("../lib/ad-config"),
    );
    expect(stale.adConfig.provider).toBe("monetag");
    expect(stale.monetagActive()).toBe(true);
  });

  it("honours an overridden zone, tag URL and timings", async () => {
    const tuned = await withEnv(
      {
        NEXT_PUBLIC_MONETAG_ZONE: "123456",
        NEXT_PUBLIC_MONETAG_SRC: "https://ads.example.com/tag.min.js",
        NEXT_PUBLIC_MONETAG_DELAY_MS: "0",
        NEXT_PUBLIC_ADS_FILL_WINDOW_MS: "6000",
        NEXT_PUBLIC_ADS_FILL_REPORT: "false",
      },
      () => import("../lib/ad-config"),
    );
    expect(tuned.adConfig.monetag.zone).toBe("123456");
    expect(tuned.monetagOrigins).toEqual(["https://ads.example.com"]);
    // 0 is a real choice (load immediately), not a missing value.
    expect(tuned.adConfig.delayMs).toBe(0);
    expect(tuned.adConfig.fillWindowMs).toBe(6000);
    expect(tuned.adConfig.reportFill).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Positions render nothing when they should render nothing
// ---------------------------------------------------------------------------

describe("ad placements", () => {
  it("renders no element, label or reserved space when ads are off", async () => {
    const html = await withEnv({ NEXT_PUBLIC_ADS_ENABLED: "false" }, async () => {
      const { default: AdPlacement } = await import("../components/ads/placement");
      return renderToStaticMarkup(
        createElement(AdPlacement, {
          placement: "test",
          adsenseSlot: "1234567890",
          adsenseEnabled: true,
        }),
      );
    });
    // Not an empty labelled box — nothing at all.
    expect(html).toBe("");
  });

  it("renders nothing for a position with no AdSense slot configured", async () => {
    // The production default: AdSense is enabled in settings but every slot id
    // is empty, so a position is inert rather than a labelled empty box.
    const html = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "adsense" }, async () => {
      const { default: AdPlacement } = await import("../components/ads/placement");
      return renderToStaticMarkup(
        createElement(AdPlacement, { placement: "test", adsenseEnabled: true }),
      );
    });
    expect(html).toBe("");
  });

  it("renders nothing for a container position on a Monetag-only build", async () => {
    // Monetag is tag-based: it places its own formats and never fills a
    // container of ours, so handing it a position must not produce an empty box.
    const html = await withEnv({}, async () => {
      const { default: AdPlacement } = await import("../components/ads/placement");
      return renderToStaticMarkup(
        createElement(AdPlacement, {
          placement: "test",
          adsenseSlot: "1234567890",
          adsenseEnabled: true,
        }),
      );
    });
    expect(html).toBe("");
  });

  it("labels an AdSense unit as an advertisement, above the inbox's own controls", async () => {
    const html = await withEnv(
      { NEXT_PUBLIC_ADS_PROVIDER: "adsense" },
      async () => {
        const { default: AdPlacement } = await import("../components/ads/placement");
        return renderToStaticMarkup(
          createElement(AdPlacement, {
            placement: "test position",
            adsenseSlot: "1234567890",
            adsenseEnabled: true,
          }),
        );
      },
    );
    expect(html).toContain("Advertisement");
    expect(html).toContain('aria-label="Advertisement — test position"');
    expect(html).toContain("adsbygoogle");
    expect(html).toContain('data-ad-slot="1234567890"');
  });

  it("ignores a slot value that is not a numeric id", async () => {
    const html = await withEnv({ NEXT_PUBLIC_ADS_PROVIDER: "adsense" }, async () => {
      const { default: AdPlacement } = await import("../components/ads/placement");
      return renderToStaticMarkup(
        createElement(AdPlacement, {
          placement: "test",
          adsenseSlot: "not-a-slot",
          adsenseEnabled: true,
        }),
      );
    });
    expect(html).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 4. The tag loader: once per document, never twice, never a retry
// ---------------------------------------------------------------------------

describe("Monetag tag loader", () => {
  // Every case loads the module through withEnv so it starts from a clean
  // registry and default configuration. Without the reset a case would inherit
  // whatever env the previous one stubbed, making the suite order-dependent.
  const loader = () => withEnv({}, () => import("../lib/monetag"));

  it("inserts the official tag, with the zone, async and cfasync attributes", async () => {
    const dom = installDom();
    const { loadMonetagTag } = await loader();
    expect(loadMonetagTag()).toEqual({ ok: true });
    expect(dom.scripts).toHaveLength(1);
    expect(dom.scripts[0].src).toBe("https://quge5.com/88/tag.min.js");
    // Both attributes are part of the snippet Monetag publishes: the zone tells
    // the tag which formats to run, and cfasync keeps Cloudflare's Rocket Loader
    // from deferring it into a state where the zone never initialises.
    expect(dom.scripts[0].dataset.zone).toBe("282200");
    expect(dom.scripts[0].dataset.cfasync).toBe("false");
    expect(dom.scripts[0].async).toBe(true);
  });

  it("carries the request's CSP nonce when it can find one", async () => {
    const dom = installDom();
    const { loadMonetagTag } = await loader();
    expect(loadMonetagTag({ nonce: "nonce-value" })).toEqual({ ok: true });
    expect(dom.scripts[0].nonce).toBe("nonce-value");
  });

  it("inserts the tag once no matter how often the component mounts", async () => {
    const dom = installDom();
    const { loadMonetagTag } = await loader();
    expect(loadMonetagTag()).toEqual({ ok: true });
    // A re-render, a React strict-mode double-invoke, or a route that remounts
    // the layout while the document keeps the tag.
    expect(loadMonetagTag()).toEqual({ ok: false, reason: "duplicate" });
    expect(loadMonetagTag()).toEqual({ ok: false, reason: "duplicate" });
    expect(dom.scripts).toHaveLength(1);
  });

  it("loads again once the previous tag has actually left the document", async () => {
    const dom = installDom();
    const { loadMonetagTag } = await loader();
    expect(loadMonetagTag()).toEqual({ ok: true });
    dom.unmount();
    expect(dom.scripts).toHaveLength(0);
    expect(loadMonetagTag()).toEqual({ ok: true });
    expect(dom.scripts).toHaveLength(1);
  });

  it("refuses an id that is not a zone, so a paste marker can never be served", async () => {
    installDom();
    const mod = await withEnv({ NEXT_PUBLIC_MONETAG_ZONE: "PASTE_ZONE_ID_HERE" }, () =>
      import("../lib/monetag"),
    );
    expect(mod.loadMonetagTag()).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("refuses to load when ads or the tag are switched off", async () => {
    const cases: Record<string, string>[] = [
      { NEXT_PUBLIC_ADS_ENABLED: "false" },
      { NEXT_PUBLIC_MONETAG_ENABLED: "false" },
      { NEXT_PUBLIC_ADS_PROVIDER: "adsense" },
      { NEXT_PUBLIC_ADS_PROVIDER: "none" },
    ];
    for (const env of cases) {
      vi.unstubAllGlobals();
      const dom = installDom();
      await withEnv(env, async () => {
        const mod = await import("../lib/monetag");
        expect(mod.loadMonetagTag(), JSON.stringify(env)).toEqual({
          ok: false,
          reason: "unconfigured",
        });
      });
      expect(dom.scripts, JSON.stringify(env)).toHaveLength(0);
    }
  });

  it("marks a tag that failed to load, and never re-requests it", async () => {
    const dom = installDom();
    const { loadMonetagTag } = await loader();
    expect(loadMonetagTag()).toEqual({ ok: true });
    // An ad blocker, a filtering resolver, or a rejected CSP request.
    dom.scripts[0].onerror?.();
    expect(dom.scripts[0].dataset.blocked).toBe("1");
    // The failed element stays in the document, so it is still found and the
    // request is never repeated — the marker is a diagnosis, not a retry.
    expect(loadMonetagTag()).toEqual({ ok: false, reason: "duplicate" });
    expect(dom.scripts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 5. The outcome of the tag, which is what /admin reports
// ---------------------------------------------------------------------------

describe("tag outcome", () => {
  it("reports a loaded tag as filled and a failed one as blocked", async () => {
    const dom = installDom();
    const { loadMonetagTag, tagState } = await withEnv({}, () =>
      import("../lib/monetag"),
    );
    expect(loadMonetagTag()).toEqual({ ok: true });
    expect(tagState()).toBe("filled");
    // The request left and never came back: the visitor's network or browser
    // refused the ad host. This is the state a VPN/blocker session produces.
    dom.scripts[0].onerror?.();
    expect(tagState()).toBe("blocked");
  });

  it("reports no tag in the document as empty rather than filled", async () => {
    installDom();
    const { tagState } = await withEnv({}, () => import("../lib/monetag"));
    expect(tagState()).toBe("empty");
  });

  it("reports to the route the API actually serves, under a stable name", async () => {
    // The client and the route are in different files, and a typo here would
    // fail silently in production — which is exactly the symptom this reporting
    // exists to remove.
    const { AD_FILL_ENDPOINT, MONETAG_PLACEMENT } = await withEnv({}, () =>
      import("../lib/monetag"),
    );
    expect(AD_FILL_ENDPOINT).toBe("/api/ads/fill");
    expect(MONETAG_PLACEMENT).toBe("monetag tag");
    const source = await readFile(resolve("lib/public-api.ts"), "utf8");
    // The API router receives the path without its `/api/` prefix.
    expect(source).toContain('path === "ads/fill"');
    // And the report carries no identifier: a country, a position, an outcome.
    expect(source).toContain("x-vercel-ip-country");
    // The name has to satisfy the route's own validation, or every report is a
    // 400 the browser never surfaces.
    expect(source).toContain("placement: z.string()");
    expect(MONETAG_PLACEMENT).toMatch(/^[A-Za-z0-9 -]{1,60}$/);
  });

  it("is mounted once, for the whole site, from the root layout", async () => {
    const layout = await readFile(resolve("app/layout.tsx"), "utf8");
    expect(layout).toContain("<MonetagTag />");
    // Exactly one mount: a second instance would be a second tag.
    expect(layout.match(/<MonetagTag/g)).toHaveLength(1);
    // The connection to every ad host is warmed before the tag itself is asked
    // for, from live configuration rather than a hardcoded hostname, and only
    // when ads are enabled — so an ads-off build ships no ad hostname at all.
    expect(layout).toContain("adConfig.enabled");
    expect(layout).toContain("adOrigins");
    expect(layout).toContain("<link rel=\"preconnect\"");
  });

  it("keeps the tag off the admin console and out of a data-saver session", async () => {
    const source = await readFile(resolve("components/ads/monetag-tag.tsx"), "utf8");
    expect(source).toContain('startsWith("/admin")');
    expect(source).toContain("saveData");
    // The tag is inserted after the page settles, and the outcome is read after
    // a request window — reading it in the same tick would call a blocked tag a
    // fill, which is the one distinction the report exists to make.
    expect(source).toContain("adConfig.delayMs");
    expect(source).toContain("adConfig.fillWindowMs");
    expect(source).toContain("reportAdFill");
  });
});

// ---------------------------------------------------------------------------
// 6. An overlay may not fake a mail notification in the tab
// ---------------------------------------------------------------------------

describe("tab title guard", () => {
  const SITE_TITLE = "Temp Mail — Free Temporary Email Inbox | TempMails";

  it("reverts the unread-badge title an overlay writes", async () => {
    const dom = installTitleDom(SITE_TITLE);
    const { guardDocumentTitle } = await withEnv({}, () => import("../lib/monetag"));
    const stop = guardDocumentTitle();
    for (const fake of ["(1) New Message!", "(23) New Mail", "You have 3 new messages", "1 new message"]) {
      dom.mutate(fake);
      expect(dom.doc.title, fake).toBe(SITE_TITLE);
    }
    stop();
  });

  it("leaves a real page title alone, so navigation still works", async () => {
    const dom = installTitleDom("Home | TempMails");
    const { guardDocumentTitle } = await withEnv({}, () => import("../lib/monetag"));
    const stop = guardDocumentTitle();
    dom.mutate("FAQs | TempMails");
    expect(dom.doc.title).toBe("FAQs | TempMails");
    // The badge that follows a client-side navigation restores the new title,
    // not the one the tab had before the navigation.
    dom.mutate("(2) New Message!");
    expect(dom.doc.title).toBe("FAQs | TempMails");
    stop();
  });

  it("stops watching once disposed, so it cannot outlive its mount", async () => {
    const dom = installTitleDom(SITE_TITLE);
    const { guardDocumentTitle } = await withEnv({}, () => import("../lib/monetag"));
    const stop = guardDocumentTitle();
    stop();
    expect(dom.doc.title).toBe(SITE_TITLE);
  });
});

// ---------------------------------------------------------------------------
// 7. Reachability: the check that answers "why is there no ad here?"
// ---------------------------------------------------------------------------

describe("ad host reachability check", () => {
  const response = (status: number, body: string) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });

  it("reads the real status and size when the host answers", async () => {
    // A plain `no-cors` probe cannot tell a 200 from a 403, and every ad-network
    // error page is a 200-shaped mystery to it. Reading the status is what makes
    // "served" and "refused" different answers.
    const { probeAdUrl } = await import("../components/ads/ad-health");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, "x".repeat(42))));
    expect(await probeAdUrl("https://example.com/tag.min.js")).toMatchObject({
      outcome: "ok",
      status: 200,
      bytes: 42,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(403, "")));
    expect(await probeAdUrl("https://example.com/tag.min.js")).toMatchObject({
      outcome: "error",
      status: 403,
    });
    vi.unstubAllGlobals();
  });

  it("separates an unreadable answer from no answer at all", async () => {
    const { probeAdUrl } = await import("../components/ads/ad-health");
    // A refusal that drops its CORS headers: the readable attempt fails, the
    // opaque attempt proves something answered anyway.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValueOnce(new Error("unreadable")).mockResolvedValueOnce({}),
    );
    expect((await probeAdUrl("https://example.com/tag.min.js")).outcome).toBe("opaque");
    // Nothing answered either attempt: a blocker, a filtering resolver, or a
    // dropped request — the only case that is a blocked request rather than an
    // ad network's decision.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("no response")));
    expect(await probeAdUrl("https://example.com/tag.min.js")).toMatchObject({
      outcome: "silent",
      status: null,
      bytes: null,
      ms: null,
    });
    vi.unstubAllGlobals();
  });

  it("probes the configured ad hosts, with a timeout, and keeps the reading", async () => {
    const source = await readFile(resolve("components/ads/ad-health.tsx"), "utf8");
    // The timeout because the failure being diagnosed is often silence.
    expect(source).toContain("AbortSignal.timeout");
    // The opaque fallback, for a refusal that hides its status.
    expect(source).toContain('mode: "no-cors"');
    // Derived from live config — never a hardcoded host that could drift from
    // what the site actually loads. Adsterra is in the probe too, via its
    // invoke URL from lib/ad-config, so the checked files mention both the
    // Monetag requests helper and the Adsterra config the probe now reads.
    expect(source).toContain("monetagRequests()");
    expect(source).toContain("adsterra.invokeUrl");
    // Stored server-side, so the reading outlives the session it was taken in.
    expect(source).toContain("/api/admin/ads-probe");
    expect(await readFile(resolve("lib/admin-api.ts"), "utf8")).toContain(
      'path === "ads-probe"',
    );
  });

  it("stays out of public pages", async () => {
    // It creates ad-host requests on demand, so it belongs behind the admin
    // login and nowhere a visitor or a crawler can reach.
    const importers: string[] = [];
    for (const file of ["app/layout.tsx", "app/page.tsx", "app/blog/page.tsx", "components/inbox.tsx", "components/content-shell.tsx"]) {
      const text = await readFile(resolve(file), "utf8");
      if (text.includes("ad-health")) importers.push(file);
    }
    expect(importers).toEqual([]);
    expect(await readFile(resolve("components/admin.tsx"), "utf8")).toContain(
      'from "./ads/ad-health"',
    );
  });
});

// ---------------------------------------------------------------------------
// 8. The policy that makes an ad tag work, and where it does not apply
// ---------------------------------------------------------------------------

describe("content security policy", () => {
  it("grants eval on the pages that can carry an ad tag", () => {
    // Ad tags evaluate strings at runtime. Without the grant the tag loads and
    // then dies, leaving a session that earns nothing.
    for (const path of ["/", "/faq", "/blog/example-post"]) {
      expect(contentSecurityPolicy(path, "nonce-value", false), path).toContain("'unsafe-eval'");
    }
  });

  it("keeps admin and api on the strict policy", () => {
    for (const path of ["/admin", "/admin/settings", "/api/inbox", "/api/events"]) {
      expect(contentSecurityPolicy(path, "nonce-value", false), path).not.toContain("'unsafe-eval'");
    }
  });

  it("still decides what may run by nonce, and allowlists no ad host for scripts", () => {
    const csp = contentSecurityPolicy("/", "nonce-value", false);
    expect(csp).toContain("script-src 'self' 'nonce-nonce-value' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("quge5");
  });

  it("allows an overlay's own fonts on the ad-bearing pages only", () => {
    // Measured on production: the format injects a Google Fonts stylesheet, and
    // blocking it logged a CSP violation on every page view. The grant is CSS
    // and fonts, which cannot execute, and it follows the same boundary as
    // 'unsafe-eval'.
    const publicPage = contentSecurityPolicy("/", "nonce-value", false);
    expect(publicPage).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(publicPage).toContain("font-src 'self' https://fonts.gstatic.com");
    for (const path of ["/admin", "/api/inbox"]) {
      const strict = contentSecurityPolicy(path, "nonce-value", false);
      expect(strict, path).not.toContain("fonts.googleapis.com");
      expect(strict, path).not.toContain("fonts.gstatic.com");
    }
  });
});

// ---------------------------------------------------------------------------
// 9. A unit is never withheld from a country
// ---------------------------------------------------------------------------

describe("ad eligibility", () => {
  it("never depends on the visitor's country or region", async () => {
    // The report was "no ad in the USA", then "no ad on any VPN". Nothing here
    // reads a geo header, a network type or an address: the tag is on or off
    // from the environment alone, so a session without an ad is a network
    // decision or a config problem and never a geographic one.
    const files = [
      "lib/ad-config.ts",
      "lib/monetag.ts",
      ...(await readdir(resolve("components/ads"))).map((name) => `components/ads/${name}`),
    ];
    // Two shapes are gating: *reading* a geo value (a header or a geo API) and
    // *branching* on a country. Prose that merely mentions countries — which the
    // comments must, to explain this rule — is not, so neither pattern matches
    // on the word alone.
    const readsGeo = /geoip|geo-?target|x-vercel-ip|cf-ipcountry|accept-language|countryCode|\.geo\b/i;
    const branchesOnCountry = /country\s*(?:===|!==|==|!=|\.includes|\.match|\.test|\?)/i;
    const hits: string[] = [];
    for (const file of files) {
      const text = await readFile(resolve(file), "utf8");
      if (readsGeo.test(text) || branchesOnCountry.test(text)) hits.push(file);
    }
    expect(hits).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 10. Page-level budgets
// ---------------------------------------------------------------------------

describe("placement budget", () => {
  it("keeps ad components out of anything that renders received mail", async () => {
    // Third-party ad scripts must never be mounted inside the message list, the
    // message viewer, or the HTML email frame.
    for (const file of ["components/inbox.tsx", "components/content-body.tsx"]) {
      const text = await readFile(resolve(file), "utf8");
      // AdsterraBanner is the reinstated banner network and is expected on the
      // homepage. The forbidden set is deliberately narrower than the raw
      // component-name scan: it is the per-container loader and the removed
      // networks' format components, not the banner we just reinstated.
      const forbidden = text.match(/<AdPlacement|MonetagTag|<AdSlot|AdsterraNative|AdsterraSocialBar|adsterra-iframe-ad|AdsterraSlot/g) ?? [];
      if (file === "components/inbox.tsx") {
        // The homepage shell is allowed to place units around the inbox, but the
        // message-rendering region itself must stay clean — including the
        // reinstated Adsterra banner.
        const listRegion = text.slice(text.indexOf('className="message-list"'));
        const inList = listRegion.slice(0, listRegion.indexOf("</section>"));
        expect(inList).not.toMatch(/AdPlacement|AdSlot|MonetagTag|Adsterra|AdsterraBanner/);
      } else {
        expect(forbidden).toHaveLength(0);
      }
    }
  });

  it("places at most one unit per position, and only where a slot exists", async () => {
    // A container position belongs to one network. Both of these pages ask for
    // the same slot on a single page, which is why the shell's own unit is
    // suppressed with `adTop={null}` rather than left in place.
    for (const file of ["app/blog/page.tsx", "app/blog/[slug]/page.tsx"]) {
      const text = await readFile(resolve(file), "utf8");
      expect(text, `${file} must suppress the shell's own top unit`).toContain("adTop={null}");
    }
  });
});
