"use client";
import { useEffect, useState, useEffectEvent, FormEvent } from "react";
import Link from "next/link";
import {
  Mail,
  LayoutDashboard,
  Globe,
  Inbox,
  ShieldCheck,
  Settings,
  FileText,
  Users,
  LogOut,
  Activity,
  KeyRound,
  RefreshCw,
  Plus,
  Check,
  Trash2,
} from "lucide-react";
import { api } from "./inbox";
import AdHealth from "./ads/ad-health";
type Row = Record<string, unknown>;
type Me = {
  email: string;
  role: string;
  permissions: string[];
  twoFactor: boolean;
};
const tabs = [
  ["analytics", "Overview", "read", LayoutDashboard],
  ["domains", "Email domains", "domains", Globe],
  ["inboxes", "Inboxes", "moderate", Inbox],
  ["messages", "Messages", "moderate", Mail],
  ["outbound", "Sent mail", "moderate", Mail],
  ["reports", "Abuse reports", "moderate", ShieldCheck],
  ["blocklist", "Blocklists", "moderate", ShieldCheck],
  ["settings", "Website settings", "settings", Settings],
  ["pages", "SEO & legal pages", "content", FileText],
  ["posts", "Blog posts", "content", FileText],
  ["redirects", "Redirects", "content", FileText],
  ["users", "Team access", "users", Users],
  ["audit", "Audit trail", "settings", Activity],
  ["login-history", "Login history", "settings", Activity],
  ["sessions", "Security", "read", KeyRound],
] as const;
const templates: Record<string, Row> = {
  domains: {
    name: "",
    active: false,
    selectable: true,
    maintenance: false,
    isDefault: false,
  },
  blocklist: { kind: "sender", value: "" },
  pages: {
    slug: "",
    title: "",
    description: "",
    body: "",
    faqs: [],
    published: false,
  },
  posts: { slug: "", title: "", metaTitle: "", description: "", body: "", category: "Privacy", author: "TempMails", publishedAt: "", reviewedAt: "", sources: [], trending: false, published: false },
  redirects: { source: "/", destination: "/", permanent: true },
  users: { email: "", role: "VIEWER", active: true, password: "" },
};
export default function Admin() {
  const [me, setMe] = useState<Me | null>(null),
    [checked, setChecked] = useState(false),
    [tab, setTab] = useState("analytics"),
    [data, setData] = useState<unknown>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Row | null>(null),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [days, setDays] = useState("7"),
    [page, setPage] = useState(1),
    [otp, setOtp] = useState<Row | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.toLowerCase().replaceAll("_", " "));
      if ((e as Error).message === "LOGIN_REQUIRED") setMe(null);
    } finally {
      setBusy(false);
    }
  };
  const load = async () => {
    const query = new URLSearchParams(
      tab === "analytics" ? { days } : { ...filters, page: String(page) },
    );
    setData(await api(`admin/${tab}?${query}`));
  };
  useEffect(() => {
    void api<Me>("admin/me")
      .then(setMe)
      .catch(() => {})
      .finally(() => setChecked(true));
  }, []);
  const reload = useEffectEvent(() => run(load));
  useEffect(() => {
    if (me) void reload();
  }, [me, tab, days, page]);
  const submit = (
    e: FormEvent<HTMLFormElement>,
    fn: (d: FormData) => Promise<void>,
  ) => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void run(() => fn(d));
  };
  if (!checked)
    return (
      <main className="admin-login">
        <p>Checking your session…</p>
      </main>
    );
  if (!me)
    return (
      <main className="admin-login">
        <Link className="brand" href="/">
          <Mail />
          TempMails.
        </Link>
        <div className="login-card">
          <span className="eyebrow">ADMINISTRATION</span>
          <h1>Welcome back.</h1>
          <p>Sign in to manage your mail service.</p>
          <form
            onSubmit={(e) =>
              submit(e, async (d) => {
                await api("admin/login", "POST", Object.fromEntries(d));
                setMe(await api<Me>("admin/me"));
              })
            }
          >
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
            <label>
              Authenticator or recovery code <small>(if enabled)</small>
              <input name="code" autoComplete="one-time-code" />
            </label>
            <button className="primary" disabled={busy}>
              Sign in securely <KeyRound size={16} />
            </button>
          </form>
          {error && (
            <p role="alert" className="admin-error">
              {error}
            </p>
          )}
          <p className="admin-note">
            First installation? Run the owner creation command from the
            deployment guide.
          </p>
        </div>
        <Link href="/">← Back to inbox</Link>
      </main>
    );
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  const stats = tab === "analytics" && data ? (data as Row) : null;
  type FillCounts = { name: string; filled: number; blocked: number; empty: number };
  const adsFill = (stats?.adsFill ?? null) as {
    totals: { filled: number; blocked: number; empty: number };
    countries: FillCounts[];
    placements: FillCounts[];
  } | null;
  const editRow = (row: Row) => {
    const clean = { ...row };
    for (const key of ["health", "_count", "id", "createdAt", "updatedAt"])
      delete clean[key];
    setEditor(clean);
  };
  const mutate = async (method: string, body: unknown) => {
    await api(`admin/${tab}`, method, body);
    setEditor(null);
    await load();
    setNotice("Changes saved.");
  };
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Mail size={20} />
          </span>
          TempMails.
        </Link>
        <span className="eyebrow">CONTROL ROOM</span>
        <nav>
          {tabs
            .filter((x) => me.permissions.includes(x[2]))
            .map(([id, label, , Icon]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => {
                  setTab(id);
                  setData(null);
                  setEditor(null);
                  setFilters({});
                  setPage(1);
                }}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
        </nav>
        <div className="admin-identity">
          <strong>{me.role.toLowerCase()}</strong>
          <span>{me.email}</span>
          <button
            onClick={() =>
              run(async () => {
                await api("admin/logout", "POST");
                setMe(null);
              })
            }
          >
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <header>
          <div>
            <span className="eyebrow">YOUR MAIL SERVICE</span>
            <h1>{tabs.find((x) => x[0] === tab)?.[1]}</h1>
          </div>
          <button className="outline" disabled={busy} onClick={() => run(load)}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </header>
        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="admin-success" role="status">
            <Check size={16} />
            {notice}
          </p>
        )}
        {stats && (
          <>
            <div className="admin-range">
              <p>Live operational totals and activity in UTC.</p>
              <select
                aria-label="Chart period"
                value={days}
                onChange={(e) => setDays(e.target.value)}
              >
                <option value="1">Today</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
            <div className="stat-grid">
              {[
                ["Total addresses", stats.addressesCreated],
                ["Active inboxes", stats.active],
                ["Received today", stats.emailsToday],
                [
                  "Message storage",
                  `${((stats.storage as number) / 1048576).toFixed(2)} MB`,
                ],
                [
                  "Attachment storage",
                  `${((stats.attachmentStorage as number) / 1048576).toFixed(2)} MB`,
                ],
                ["Open abuse reports", stats.reports],
                ["Page views", (stats.sums as Row).page_view || 0],
                ["Blocked requests", (stats.sums as Row).blocked || 0],
                ["API errors", (stats.sums as Row).api_error || 0],
                ["Ad units filled", adsFill?.totals.filled ?? 0],
                ["Ad units empty", adsFill?.totals.empty ?? 0],
                ["Ad units blocked", adsFill?.totals.blocked ?? 0],
                [
                  "Processing success",
                  stats.successRate === null
                    ? "No attempts"
                    : `${stats.successRate}%`,
                ],
              ].map(([label, value]) => (
                <article key={String(label)}>
                  <span>{String(label)}</span>
                  <strong>{String(value)}</strong>
                </article>
              ))}
            </div>
            <section className="admin-panel">
              <h2>Mail & address activity</h2>
              <div className="chart">
                {Object.entries(
                  stats.daily as Record<string, Record<string, number>>,
                )
                  .sort()
                  .map(([day, values]) => (
                    <div className="chart-day" key={day}>
                      <div className="chart-bars">
                        <span
                          title={`${values.mail_received || 0} received`}
                          style={{
                            height: Math.max(
                              2,
                              (120 * (values.mail_received || 0)) /
                                Math.max(
                                  1,
                                  ...Object.values(
                                    stats.daily as Record<
                                      string,
                                      Record<string, number>
                                    >,
                                  ).map((v) => v.mail_received || 0),
                                ),
                            ),
                          }}
                        />
                        <i
                          title={`${values.address_created || 0} created`}
                          style={{
                            height: Math.max(
                              2,
                              (120 * (values.address_created || 0)) /
                                Math.max(
                                  1,
                                  ...Object.values(
                                    stats.daily as Record<
                                      string,
                                      Record<string, number>
                                    >,
                                  ).map((v) => v.address_created || 0),
                                ),
                            ),
                          }}
                        />
                      </div>
                      <small>{day.slice(5)}</small>
                    </div>
                  ))}
              </div>
              <p className="chart-legend">
                Green: received mail · Mint: addresses created. Values are
                available in the table below.
              </p>
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Messages</th>
                      <th>Addresses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(
                      stats.daily as Record<string, Record<string, number>>,
                    )
                      .sort()
                      .map(([day, v]) => (
                        <tr key={day}>
                          <td>{day}</td>
                          <td>{v.mail_received || 0}</td>
                          <td>{v.address_created || 0}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            {adsFill &&
              adsFill.totals.filled + adsFill.totals.empty + adsFill.totals.blocked >
                0 && (
                <section className="admin-panel">
                  <h2>Ad fill</h2>
                  <p>
                    Every page view reports whether the ad tag reached the
                    document, once its window closes. <strong>Filled</strong>{" "}
                    means the tag loaded, which is the only state in which any
                    ad can serve. <strong>Blocked</strong> means the ad host
                    never answered — an ad blocker, a resolver or VPN that
                    filters ad domains, or a policy rejection.{" "}
                    <strong>Empty</strong> means the tag was not in the document
                    when it was read. Counters are aggregate: a country, a
                    position and an outcome, never a visitor.
                  </p>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Country</th>
                          <th>Filled</th>
                          <th>Empty</th>
                          <th>Blocked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adsFill.countries.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.filled}</td>
                            <td>{row.empty}</td>
                            <td>{row.blocked}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="admin-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Position</th>
                          <th>Filled</th>
                          <th>Empty</th>
                          <th>Blocked</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adsFill.placements.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.filled}</td>
                            <td>{row.empty}</td>
                            <td>{row.blocked}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            <AdHealth />
            <section className="admin-panel">
              <h2>Domain health</h2>
              {(stats.domains as Row[]).map((d) => (
                <p key={String(d.name)}>
                  <strong>{String(d.name)}</strong> ·{" "}
                  {d.maintenance
                    ? "Maintenance"
                    : d.active
                      ? "Active"
                      : "Inactive"}{" "}
                  ·{" "}
                  {d.health ? String((d.health as Row).status) : "Not checked"}
                </p>
              ))}
            </section>
          </>
        )}
        {tab === "settings" && !!data && (
          <section className="admin-panel">
            <h2>Website & service controls</h2>
            <p>
              Changes apply to the live site. Enable attachments only after
              configuring the scanner. Custom scripts are restricted to the
              owner.
            </p>
            <h3>Anonymous sending</h3>
            <p>
              Sending enabled lets visitors send plain-text email from their
              temporary address. Mail to another hosted temp domain is delivered
              internally. External mail requires RESEND_API_KEY (with the
              sending domain verified in Resend) or SMTP_URL on the server, and
              SPF/DKIM published for the domain. Limits: per inbox per hour, per
              device and per day site-wide. Review the Sent mail tab and
              blocklists regularly.
            </p>
            <h3>Google AdSense</h3>
            <p>
              Publisher: ca-pub-3624892885273135. Create responsive display
              units in AdSense and paste each numeric data-ad-slot value below.
              Homepage: <strong>top slot</strong> (under the inbox card),{" "}
              <strong>mid slot</strong> (after &ldquo;how it works&rdquo;),{" "}
              <strong>bottom slot</strong> (before the footer). Articles:{" "}
              <strong>article top slot</strong> (under the title),{" "}
              <strong>content slot</strong> (after the body). Then tick
              &ldquo;Adsense enabled&rdquo;. Empty slots render nothing.
            </p>
            <h3>Monetag</h3>
            <p>
              The Monetag tag runs site-wide and is configured on the server
              rather than here, because it is compiled into the client bundle at
              build time. Set <code>NEXT_PUBLIC_MONETAG_ZONE</code> (currently{" "}
              <strong>282200</strong>) and redeploy; which formats it shows is a
              setting in the Monetag dashboard, not this site.{" "}
              <code>NEXT_PUBLIC_ADS_ENABLED=false</code> removes every ad script
              from the site in one step, and{" "}
              <code>NEXT_PUBLIC_ADS_PROVIDER</code> chooses between{" "}
              <code>monetag</code>, <code>adsense</code>, <code>both</code> and{" "}
              <code>none</code>. See docs/MONETIZATION.md for the placement map.
            </p>
            <SettingsForm
              initial={data as Row}
              owner={me.role === "OWNER"}
              busy={busy}
              onSave={(value) => run(() => mutate("POST", value))}
            />
          </section>
        )}
        {tab === "sessions" && (
          <section className="admin-panel">
            <h2>Account security</h2>
            <p>
              Sessions expire after 30 minutes of inactivity, with an 8-hour
              maximum lifetime. Two-factor authentication is{" "}
              {me.twoFactor ? "enabled" : "not enabled"}.
            </p>
            {!me.twoFactor && !otp && (
              <form
                className="admin-form"
                onSubmit={(e) =>
                  submit(e, async (d) => {
                    setOtp(
                      await api<Row>("admin/2fa/setup", "POST", {
                        password: d.get("password"),
                      }),
                    );
                  })
                }
              >
                <label>
                  Confirm password
                  <input
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <button className="outline" disabled={busy}>
                  Set up authenticator
                </button>
              </form>
            )}
            {otp && (
              <>
                <p>
                  Add this secret to your authenticator app, then enter its
                  code.
                </p>
                <code className="recovery-code">
                  {String(otp.secret || "")}
                </code>
                {otp.recoveryCodes ? (
                  <>
                    <p>Save these recovery codes securely. Each works once.</p>
                    <pre className="recovery-code">
                      {(otp.recoveryCodes as string[]).join("\n")}
                    </pre>
                  </>
                ) : (
                  <form
                    className="admin-form"
                    onSubmit={(e) =>
                      submit(e, async (d) => {
                        setOtp(
                          await api<Row>("admin/2fa/enable", "POST", {
                            code: d.get("code"),
                          }),
                        );
                        setMe({ ...me, twoFactor: true });
                      })
                    }
                  >
                    <label>
                      Authenticator code
                      <input
                        name="code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        required
                      />
                    </label>
                    <button className="primary">Enable two-factor</button>
                  </form>
                )}
              </>
            )}
            <h2>Change password</h2>
            <form
              className="admin-form"
              onSubmit={(e) =>
                submit(e, async (d) => {
                  await api("admin/password", "POST", Object.fromEntries(d));
                  setNotice("Password updated. Other sessions were revoked.");
                })
              }
            >
              <label>
                Current password
                <input
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </label>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  minLength={14}
                  autoComplete="new-password"
                  required
                />
              </label>
              <button className="outline" disabled={busy}>
                Update password
              </button>
            </form>
          </section>
        )}
        {!["analytics", "settings"].includes(tab) && (
          <section className="admin-panel">
            <div className="panel-heading">
              <h2>{tab === "sessions" ? "Active sessions" : "Records"}</h2>
              {templates[tab] && (
                <button
                  className="primary"
                  onClick={() => setEditor({ ...templates[tab] })}
                >
                  <Plus size={16} />
                  Add {tab === "domains" ? "domain" : "record"}
                </button>
              )}
              {tab === "inboxes" && (
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const r = await api<Row>("admin/cleanup", "POST");
                      await load();
                      setNotice(`Deleted ${r.deletedInboxes} expired inboxes.`);
                    })
                  }
                >
                  Clean up expired
                </button>
              )}
            </div>
            {["inboxes", "messages", "outbound"].includes(tab) && (
              <form
                className="filter-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  void run(load);
                }}
              >
                {[
                  "search",
                  "domain",
                  "sender",
                  "recipient",
                  "ipHash",
                  "from",
                  "to",
                ]
                  .filter(
                    (k) =>
                      tab === "messages" ||
                      (tab === "outbound" && k !== "domain") ||
                      (tab === "inboxes" &&
                        !["sender", "recipient"].includes(k)),
                  )
                  .map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        type={
                          ["from", "to"].includes(key)
                            ? "datetime-local"
                            : "text"
                        }
                        value={
                          ["from", "to"].includes(key)
                            ? filters[key]?.slice(0, 16) || ""
                            : filters[key] || ""
                        }
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            [key]:
                              ["from", "to"].includes(key) && e.target.value
                                ? new Date(e.target.value).toISOString()
                                : e.target.value,
                          })
                        }
                      />
                    </label>
                  ))}
                <label>
                  Status
                  <select
                    value={filters.status || "all"}
                    onChange={(e) =>
                      setFilters({ ...filters, status: e.target.value })
                    }
                  >
                    {(tab === "outbound"
                      ? ["all", "sent", "failed", "pending"]
                      : ["all", "active", "expired", "suspended"]
                    ).map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <button className="outline">Apply filters</button>
              </form>
            )}
            {editor && (
              <div className="record-editor">
                <h3>Edit {tab}</h3>
                <SettingsForm
                  initial={editor}
                  owner={me.role === "OWNER"}
                  busy={busy}
                  onSave={(value) => run(() => mutate("POST", value))}
                />
                <button onClick={() => setEditor(null)}>Cancel</button>
              </div>
            )}
            {rows.length ? (
              <div className="admin-table-wrap">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(rows[0]).map((k) => (
                        <th key={k}>{k}</th>
                      ))}
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr
                        key={String(
                          r.id || r.publicId || r.name || r.slug || i,
                        )}
                      >
                        {Object.entries(r).map(([k, v]) => (
                          <td key={k}>
                            {typeof v === "object" ? (
                              <details>
                                <summary>View</summary>
                                <pre>{JSON.stringify(v, null, 2)}</pre>
                              </details>
                            ) : (
                              String(v ?? "—")
                            )}
                          </td>
                        ))}
                        <td>
                          <div className="table-actions">
                            {templates[tab] && (
                              <button onClick={() => editRow(r)}>Edit</button>
                            )}
                            {tab === "domains" && (
                              <button
                                onClick={() =>
                                  run(async () => {
                                    await api("admin/domains/check", "POST", {
                                      name: r.name,
                                    });
                                    await load();
                                  })
                                }
                              >
                                Check DNS
                              </button>
                            )}
                            {tab === "domains" && (
                              <button
                                onClick={() =>
                                  run(async () => {
                                    const confirmation = window.prompt(
                                      `Type ${r.name} to delete this domain.`,
                                    );
                                    if (confirmation !== r.name) return;
                                    const expireInboxes =
                                      Number((r._count as Row)?.inboxes) > 0
                                        ? window.confirm(
                                            "This domain has inboxes. Explicitly expire and delete all of them?",
                                          )
                                        : false;
                                    await mutate("DELETE", {
                                      name: r.name,
                                      confirmation,
                                      expireInboxes,
                                    });
                                  })
                                }
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            )}
                            {tab === "inboxes" && (
                              <button
                                onClick={() =>
                                  run(() =>
                                    mutate("PATCH", {
                                      publicId: r.publicId,
                                      suspended: !r.suspended,
                                    }),
                                  )
                                }
                              >
                                {r.suspended ? "Unsuspend" : "Suspend"}
                              </button>
                            )}
                            {tab === "outbound" && !!r.inbox && (
                              <button
                                onClick={() =>
                                  run(async () => {
                                    await api("admin/inboxes", "PATCH", {
                                      publicId: (r.inbox as Row).publicId,
                                      suspended: !(r.inbox as Row).suspended,
                                    });
                                    await load();
                                  })
                                }
                              >
                                {(r.inbox as Row).suspended
                                  ? "Unsuspend sender"
                                  : "Suspend sender"}
                              </button>
                            )}
                            {[
                              "inboxes",
                              "messages",
                              "pages",
                              "posts",
                              "blocklist",
                              "redirects",
                            ].includes(tab) && (
                              <button
                                onClick={() =>
                                  run(async () => {
                                    if (
                                      window.confirm(
                                        "Permanently delete this record?",
                                      )
                                    )
                                      await mutate(
                                        "DELETE",
                                        r.publicId
                                          ? { publicId: r.publicId }
                                          : r.slug
                                            ? { slug: r.slug }
                                            : tab === "blocklist"
                                              ? { kind: r.kind, value: r.value }
                                              : {
                                                  source: r.source,
                                                  destination: r.destination,
                                                  permanent: r.permanent,
                                                },
                                      );
                                  })
                                }
                              >
                                Delete
                              </button>
                            )}
                            {tab === "reports" && (
                              <button
                                onClick={() =>
                                  run(() =>
                                    mutate("PATCH", {
                                      id: r.id,
                                      status:
                                        r.status === "OPEN"
                                          ? "RESOLVED"
                                          : "OPEN",
                                    }),
                                  )
                                }
                              >
                                {r.status === "OPEN" ? "Resolve" : "Reopen"}
                              </button>
                            )}
                            {tab === "sessions" && (
                              <button
                                onClick={() =>
                                  run(() => mutate("DELETE", { id: r.id }))
                                }
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{busy ? "Loading records…" : "No records to display."}</p>
            )}
            {["inboxes", "messages", "outbound"].includes(tab) && (
              <div className="pagination">
                <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={rows.length < 50}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
            {tab === "domains" && (
              <div className="dns-guide">
                <h3>Connect your email domain</h3>
                <ol>
                  <li>Enable Email Routing for the domain in Cloudflare.</li>
                  <li>
                    Copy the exact MX and TXT records shown by Cloudflare into
                    your authoritative DNS. Avoid combining unrelated MX
                    providers.
                  </li>
                  <li>
                    Deploy the email worker, queue, and private spool using the
                    guide in docs/DEPLOYMENT.md.
                  </li>
                  <li>
                    Route catch-all mail to the worker. Check DNS, activate this
                    domain, then send a real test email.
                  </li>
                </ol>
                <p>
                  MX presence confirms DNS publication; it does not prove
                  end-to-end delivery. Test delivery before opening the service.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
function SettingsForm({
  initial,
  owner,
  busy,
  onSave,
}: {
  initial: Row;
  owner: boolean;
  busy: boolean;
  onSave: (value: Row) => void;
}) {
  const [value, setValue] = useState(initial),
    [invalid, setInvalid] = useState("");
  useEffect(() => setValue(initial), [initial]);
  return (
    <form
      className="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onSave(value);
      }}
    >
      {Object.entries(value)
        .filter(
          ([k]) =>
            ![
              "id",
              "publicId",
              "createdAt",
              "updatedAt",
              "health",
              "_count",
            ].includes(k),
        )
        .map(([key, val]) => (
          <label
            key={key}
            className={typeof val === "boolean" ? "checkbox-field" : ""}
          >
            <span>
              {key
                .replace(/([A-Z])/g, " $1")
                .replace(/^./, (s) => s.toUpperCase())}
            </span>
            {typeof val === "boolean" ? (
              <input
                type="checkbox"
                checked={val}
                disabled={!owner && ["scriptsEnabled"].includes(key)}
                onChange={(e) =>
                  setValue({ ...value, [key]: e.target.checked })
                }
              />
            ) : typeof val === "number" ? (
              <input
                type="number"
                value={val}
                required
                onChange={(e) =>
                  setValue({ ...value, [key]: Number(e.target.value) })
                }
              />
            ) : typeof val === "object" ? (
              <textarea
                defaultValue={JSON.stringify(val, null, 2)}
                aria-label={`${key} JSON`}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setValue({ ...value, [key]: parsed });
                    setInvalid("");
                  } catch {
                    setInvalid(`Invalid JSON in ${key}`);
                  }
                }}
              />
            ) : [
                "body",
                "customScript",
                "homepageText",
                "description",
                "announcement",
                "sendFooter",
              ].includes(key) ? (
              <textarea
                value={String(val ?? "")}
                disabled={key === "customScript" && !owner}
                onChange={(e) => setValue({ ...value, [key]: e.target.value })}
              />
            ) : (
              <input
                type={key === "password" ? "password" : "text"}
                value={String(val ?? "")}
                onChange={(e) => setValue({ ...value, [key]: e.target.value })}
              />
            )}
          </label>
        ))}
      {invalid && <p role="alert">{invalid}</p>}
      <button className="primary" disabled={busy || !!invalid}>
        Save changes <Check size={16} />
      </button>
    </form>
  );
}
