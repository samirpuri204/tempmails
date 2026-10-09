"use client";

import { useState } from "react";
import { monetagRequests } from "@/lib/monetag";
import { adsterra, adsterraActive } from "@/lib/ad-config";

export type AdProbe = {
  url: string;
  /**
   * `ok`     — the loader was served and read back in full.
   * `error`  — a readable non-2xx answer (403, 404, 5xx): the ad network
   *            answered this address with a refusal.
   * `opaque` — something answered but its status is not readable, which is what
   *            an error response without CORS headers looks like from here.
   * `silent` — nothing came back at all: a blocker, a filtering resolver, or a
   *            request that was simply dropped.
   */
  outcome: "ok" | "error" | "opaque" | "silent";
  status: number | null;
  bytes: number | null;
  ms: number | null;
};

/**
 * Asks this browser what the ad host does with *its* request — a plain
 * `no-cors` probe cannot, because every response, error pages included, is
 * opaque and only tells you that something answered.
 *
 * The ad hosts send `access-control-allow-origin: *`, so a normal CORS request
 * reads the real status and body length. When that fails, a second opaque
 * attempt separates "answered with something unreadable" (typically an error
 * response that drops the CORS headers) from "nothing answered at all". Only
 * the second of those is a blocked or dropped request.
 *
 * This is a probe, not a request for an ad: the loader URL is fetched and
 * discarded, and no creative or impression is involved.
 */
export async function probeAdUrl(url: string, timeoutMs = 8000): Promise<AdProbe> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      url,
      outcome: response.ok ? "ok" : "error",
      status: response.status,
      bytes: body.length,
      ms: Date.now() - started,
    };
  } catch {
    try {
      await fetch(url, {
        mode: "no-cors",
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
      return { url, outcome: "opaque", status: null, bytes: null, ms: Date.now() - started };
    } catch {
      return { url, outcome: "silent", status: null, bytes: null, ms: null };
    }
  }
}

const describe = (probe: AdProbe) => {
  if (probe.outcome === "ok") return `Served · ${probe.bytes} bytes`;
  if (probe.outcome === "error") return `Refused · HTTP ${probe.status}`;
  if (probe.outcome === "opaque") return "Answered, status not readable";
  return "No response";
};

/**
 * "Why is there no ad in this session?", answered from the owner's own browser.
 *
 * A blank page has several causes that look identical from the outside. They do
 * not look identical here: a served tag that still shows nothing is a zone or
 * format setting on the network's side, an HTTP refusal is the network
 * declining this address (routine for VPN and datacenter ranges), and no
 * response at all is a blocker, a filtering resolver, or a dropped request. Run
 * it once normally and once with a VPN — the difference between the two runs is
 * the diagnosis.
 *
 * It also stores what it measured, so a report of "it still doesn't work" can be
 * checked against the numbers that were actually on screen instead of recounted
 * from memory.
 */
export default function AdHealth() {
  const [probes, setProbes] = useState<AdProbe[] | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = [
    ...monetagRequests().filter(Boolean),
    ...(adsterraActive() && adsterra.invokeUrl ? [adsterra.invokeUrl] : []),
  ];

  const run = async () => {
    setBusy(true);
    try {
      const results = await Promise.all(targets.map((url) => probeAdUrl(url)));
      setProbes(results);
      // Best effort: the reading is useful on screen, and useful again later.
      await fetch("/api/admin/ads-probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ results }),
      }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const silent = probes?.filter((probe) => probe.outcome === "silent").length ?? 0;
  const refused = probes?.filter((probe) => probe.outcome === "error").length ?? 0;

  return (
    <section className="admin-panel">
      <h2>Ad network reachability</h2>
      <p>
        Asks the ad hosts what they do with a request from{" "}
        <strong>this browser, on this connection</strong>. Nothing is rendered and
        no impression is requested — the loader URL is fetched and thrown away.
        Run it once normally and once with a VPN; the difference between the two
        runs is the whole answer.
      </p>
      <button className="primary" onClick={() => void run()} disabled={busy}>
        {busy ? "Checking…" : "Check from this browser"}
      </button>
      {probes && (
        <>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ad host</th>
                  <th>What came back</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {probes.map((probe) => (
                  <tr key={probe.url}>
                    <td>{new URL(probe.url).host}</td>
                    <td>{describe(probe)}</td>
                    <td>{probe.ms === null ? "—" : `${probe.ms} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            {silent > 0 ? (
              <>
                {silent} of {probes.length} ad hosts never answered this browser,
                so no creative can load here at all: an ad blocker, a filtering
                resolver, or a dropped request — not the site's policy, which is
                identical on every connection.
              </>
            ) : refused > 0 ? (
              <>
                {refused} of {probes.length} ad hosts refused this browser with an
                error status. The request reached them and was turned away, which
                is what a VPN or datacenter address usually gets — the network
                declines to serve it, and no site setting can override that.
              </>
            ) : (
              <>
                Every ad host served this browser. So a blank position here is
                either a creative the network had nothing for, or a script-level
                refusal (an extension that allows the request but blocks the
                script). Compare it against the <strong>Ad fill</strong> table
                above: <em>empty</em> means the network served nothing,{" "}
                <em>blocked</em> means the loader never arrived.
              </>
            )}
          </p>
        </>
      )}
    </section>
  );
}
