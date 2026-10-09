"use client";
import AdPlacement from "./ads/placement";
import AdsterraBanner from "./ads/adsterra-banner";
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useEffectEvent,
  FormEvent,
} from "react";
import Link from "next/link";
import Script from "next/script";
import {
  Mail,
  ArrowUpRight,
  Copy,
  Check,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
  SlidersHorizontal,
  ShieldCheck,
  LockKeyhole,
  Zap,
  ChevronDown,
  Search,
  Inbox as InboxIcon,
  Sun,
  Moon,
  Volume2,
  VolumeX,
  Bell,
  ArrowLeft,
  Download,
  Flag,
  X,
  QrCode,
  KeyRound,
  ArrowRight,
  LoaderCircle,
  Send,
} from "lucide-react";
import QRCode from "qrcode";
import Image from "next/image";
import en from "@/locales/en.json";
import ne from "@/locales/ne.json";
type InboxData = { address: string; expiresAt: string; recoveryToken?: string };
type Attachment = {
  publicId: string;
  name: string;
  mime: string;
  size: number;
  scanStatus: string;
};
type Message = {
  publicId: string;
  sender: string;
  senderName: string;
  recipient: string;
  subject: string;
  receivedAt: string;
  readAt: string | null;
  attachments: Attachment[];
  text?: string;
  html?: string;
};
type Config = {
  domains: { name: string; isDefault: boolean }[];
  customUsernames: boolean;
  retentionMinutes: number;
  maintenance: boolean;
  sending?: {
    enabled: boolean;
    external: boolean;
    maxChars: number;
    limitPerInbox: number;
  };
};
type SentMessage = {
  id: string;
  to: string;
  subject: string;
  status: string;
  createdAt: string;
};
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.code || "SERVICE_UNAVAILABLE");
  return data.data;
}
export default function Inbox({
  name,
  headline,
  announcement,
  initialTheme = "light",
  nonce,
  logo = "",
  languages = ["en", "ne"],
  socialLinks = [],
  ads = [],
  adsenseEnabled = false,
  adsenseTopSlot = "",
  adsenseMidSlot = "",
  adsenseBottomSlot = "",
  children,
}: {
  name: string;
  headline: string;
  announcement: string;
  initialTheme?: string;
  nonce?: string;
  logo?: string;
  languages?: string[];
  socialLinks?: { label: string; url: string }[];
  ads?: { label: string; url: string }[];
  adsenseEnabled?: boolean;
  adsenseTopSlot?: string;
  adsenseMidSlot?: string;
  adsenseBottomSlot?: string;
  children?: React.ReactNode;
}) {
  const [lang, setLang] = useState<"en" | "ne">("en"),
    [theme, setTheme] = useState(initialTheme);
  const t = lang === "ne" ? ne : en;
  const [inbox, setInbox] = useState<InboxData | null>(null),
    [config, setConfig] = useState<Config | null>(null),
    [messages, setMessages] = useState<Message[]>([]),
    [total, setTotal] = useState(0),
    [unread, setUnread] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [live, setLive] = useState(false),
    [now, setNow] = useState(0),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [order, setOrder] = useState("newest"),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Message | null>(null),
    [formatted, setFormatted] = useState(false),
    [remote, setRemote] = useState(false),
    [sound, setSound] = useState(false),
    [modal, setModal] = useState<
      | null
      | "custom"
      | "restore"
      | "recovery"
      | "delete"
      | "new"
      | "qr"
      | "report"
      | "compose"
    >(null),
    [recovery, setRecovery] = useState(""),
    [qr, setQr] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [turnstileReady, setTurnstileReady] = useState(false),
    [view, setView] = useState<"inbox" | "sent">("inbox"),
    [sentItems, setSentItems] = useState<SentMessage[]>([]),
    [composeText, setComposeText] = useState("");
  // A creation dialog must own the challenge while the background page is inert.
  // The compose dialog uses a separate Turnstile action so a token minted for
  // inbox creation can never be replayed against the send endpoint.
  const captchaPlacement =
    modal === "custom" || modal === "new" || modal === "compose"
      ? "dialog"
      : !inbox && !loading && !modal
        ? "page"
        : null;
  const captchaAction = modal === "compose" ? "send-mail" : "create-inbox";
  const sendingOn = Boolean(config?.sending?.enabled);
  const sendMax = config?.sending?.maxChars ?? 4000;
  const needsCaptcha = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const captchaEl = useRef<HTMLDivElement>(null),
    widget = useRef<string | undefined>(undefined),
    dialog = useRef<HTMLDialogElement>(null),
    known = useRef<Set<string>>(new Set()),
    initialized = useRef(false),
    firstFetch = useRef(true),
    autoCreated = useRef(false),
    soundRef = useRef(false);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const notify = useCallback((text: string) => {
    setToast(text);
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem("tm-theme");
    if (stored) setTheme(stored);
    const language = localStorage.getItem("tm-lang");
    if (language === "ne") setLang("ne");
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("tm-theme", theme);
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = lang;
    localStorage.setItem("tm-lang", lang);
  }, [lang]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
    else dialog.current?.close();
  }, [modal]);
  const errorMessage = (e: unknown) => {
    const code = e instanceof Error ? e.message : "";
    if (code === "CAPTCHA_REQUIRED") return t.required;
    if (code === "INBOX_UNAVAILABLE") return t.expired;
    if (code === "TOO_MANY_REQUESTS") return t.tooMany;
    if (code === "USERNAME_NOT_ALLOWED") return t.usernameHint;
    if (code === "ADDRESS_ALREADY_USED") return t.usernameTaken;
    if (code === "SENDING_DISABLED") return t.sendDisabled;
    if (code === "SENDING_UNAVAILABLE") return t.sendUnavailable;
    if (code === "INVALID_RECIPIENT") return t.invalidRecipient;
    if (code === "RECIPIENT_BLOCKED") return t.recipientBlocked;
    if (code === "MESSAGE_BLOCKED") return t.messageBlocked;
    if (code === "MESSAGE_TOO_LONG") return t.messageTooLong;
    if (code === "EMPTY_MESSAGE") return t.emptyMessage;
    if (code === "DELIVERY_FAILED") return t.deliveryFailed;
    return code === "SERVICE_UNAVAILABLE" || code === "NO_EMAIL_DOMAIN"
      ? t.service
      : code.toLowerCase().replaceAll("_", " ");
  };
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const create = async (values: Record<string, string> = {}) => {
    try {
      const data = await api<InboxData>("inbox", "POST", {
        ...values,
        captcha,
      });
      setInbox(data);
      if (data.recoveryToken) setRecovery(data.recoveryToken);
      setSelected(null);
      setMessages([]);
      known.current = new Set();
      firstFetch.current = true;
      setModal(null);
    } finally {
      // Tokens are single-use, including when a later server check fails.
      setCaptcha("");
      if (widget.current) window.turnstile?.reset(widget.current);
    }
  };
  const init = async () => {
    setLoading(true);
    setError("");
    try {
      const cfg = await api<Config>("config");
      setConfig(cfg);
      try {
        setInbox(await api<InboxData>("inbox"));
      } catch (e) {
        if (
          e instanceof Error &&
          !["INBOX_REQUIRED", "INBOX_UNAVAILABLE"].includes(e.message)
        )
          throw e;
        if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) await create();
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  const autoCreate = useEffectEvent(() => action(() => create()));
  useEffect(() => {
    if (
      captcha && !inbox && !loading && !modal && !autoCreated.current
    ) {
      autoCreated.current = true;
      void autoCreate();
    }
  }, [captcha, inbox, loading, modal]);
  const initialize = useEffectEvent(() => init());
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initialize();
  }, []); // initialization is deliberately once per browser mount
  useEffect(() => {
    setCaptcha("");
    const turnstile = window.turnstile;
    if (!turnstileReady || !captchaPlacement || !captchaEl.current || !turnstile)
      return;
    let active = true;
    const id = turnstile.render(captchaEl.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      action: captchaAction,
      callback: (value: string) => { if (active) setCaptcha(value); },
      "expired-callback": () => { if (active) setCaptcha(""); },
      "error-callback": () => { if (active) setCaptcha(""); },
    });
    widget.current = id;
    return () => {
      active = false;
      widget.current = undefined;
      turnstile.remove(id);
    };
  }, [turnstileReady, captchaPlacement, captchaAction]);
  const fetchMessages = useCallback(async () => {
    if (!inbox) return;
    const data = await api<{
      messages: Message[];
      total: number;
      unread: number;
    }>(
      `messages?search=${encodeURIComponent(query)}&order=${order}&page=${page}`,
    );
    const fresh = data.messages.some((m) => !known.current.has(m.publicId));
    if (fresh && !firstFetch.current) {
      notify(lang === "ne" ? ne.newMessage : en.newMessage);
      if (soundRef.current) {
        try {
          const a = new AudioContext(),
            o = a.createOscillator(),
            g = a.createGain();
          o.connect(g);
          g.connect(a.destination);
          g.gain.value = 0.035;
          o.frequency.value = 760;
          o.start();
          o.stop(a.currentTime + 0.12);
          o.onended = () => void a.close();
        } catch {}
      }
      if ("Notification" in window && Notification.permission === "granted")
        new Notification("TempMails", {
          body: lang === "ne" ? ne.newMessage : en.newMessage,
        });
    }
    firstFetch.current = false;
    data.messages.forEach((m) => known.current.add(m.publicId));
    setMessages(data.messages);
    setTotal(data.total);
    setUnread(data.unread);
  }, [inbox, query, order, page, notify, lang]);
  useEffect(() => {
    if (!inbox) return;
    void fetchMessages().catch(() => setLive(false));
    const ev = new EventSource("/api/events");
    ev.addEventListener("inbox", () => {
      setLive(true);
      void fetchMessages().catch(() => setLive(false));
    });
    ev.addEventListener("unavailable", () => {
      setLive(false);
      ev.close();
    });
    ev.onerror = () => setLive(false);
    const interval = setInterval(
      () => void fetchMessages().catch(() => setLive(false)),
      15000,
    );
    return () => {
      ev.close();
      clearInterval(interval);
    };
  }, [inbox, fetchMessages]);
  const seconds =
    inbox && now
      ? Math.max(
          0,
          Math.floor((new Date(inbox.expiresAt).getTime() - now) / 1000),
        )
      : 0;
  const countdown = `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  const openMessage = (m: Message) =>
    action(async () => {
      setSelected(await api<Message>(`messages/${m.publicId}`));
      setFormatted(false);
      setRemote(false);
      await fetchMessages();
    });
  const copy = (text: string) =>
    action(async () => {
      await navigator.clipboard.writeText(text);
      notify(t.copied);
    });
  const fetchSent = useCallback(async () => {
    if (!inbox) return;
    setSentItems(await api<SentMessage[]>("sent"));
  }, [inbox]);
  useEffect(() => {
    // Sent history belongs to the current address; drop it when the address
    // changes so a new inbox never shows the previous one's outbound rows.
    setSentItems([]);
    setView("inbox");
  }, [inbox?.address]);
  useEffect(() => {
    if (view === "sent" && inbox) void fetchSent().catch(() => {});
  }, [view, inbox, fetchSent]);
  const send = async (d: FormData) => {
    try {
      await api("send", "POST", {
        to: String(d.get("to") ?? ""),
        subject: String(d.get("subject") ?? ""),
        text: String(d.get("text") ?? ""),
        ...(captcha ? { captcha } : {}),
      });
      setComposeText("");
      setModal(null);
      notify(t.sendSuccess);
      setView("sent");
      await fetchSent().catch(() => {});
    } finally {
      // Turnstile tokens are single-use, including when the server rejects.
      setCaptcha("");
      if (widget.current) window.turnstile?.reset(widget.current);
    }
  };
  const statusLabel = (s: string) =>
    s === "SENT" ? t.statusSent : s === "FAILED" ? t.statusFailed : t.statusPending;
  const form = (
    e: FormEvent<HTMLFormElement>,
    fn: (data: FormData) => Promise<void>,
  ) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    void action(() => fn(data));
  };
  return (
    <>
      <header className="site-header">
        <Link href="/" className="brand" aria-label={name}>
          <span className="brand-icon">
            {logo ? (
              <Image unoptimized src={logo} alt="" width={28} height={28} />
            ) : (
              <Mail size={23} />
            )}
          </span>
          {name}
          <span className="brand-dot">.</span>
        </Link>
        <nav aria-label={t.menu}>
          <Link href="/how-it-works">{t.how}</Link>
          <Link href="/faq">{t.faq}</Link>
          <span className="nav-divider" />
          <select
            aria-label={t.language}
            value={lang}
            onChange={(e) => setLang(e.target.value as "en" | "ne")}
          >
            {languages.includes("en") && <option value="en">EN</option>}
            {languages.includes("ne") && <option value="ne">ने</option>}
          </select>
          <button
            className="icon-button"
            aria-label={t.theme}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </nav>
      </header>
      {announcement && <div className="announcement">{announcement}</div>}
      <main className="workspace">
        <section className="intro">
          <span className="eyebrow">
            <span className="tiny-line" />
            {t.badge}
          </span>
          <h1>
            {headline && headline !== en.hero + " " + en.heroAccent ? (
              headline
            ) : (
              <>
                {t.hero}
                <br />
                <span>{t.heroAccent}</span>
              </>
            )}
          </h1>
          <p>{t.intro}</p>
        </section>
        <section className="address-card" aria-label={t.address}>
          <div className="address-heading">
            <span className="address-heading-text">{t.address}</span>
            <span className="private-badge">
              <LockKeyhole size={12} />
              {t.private}
            </span>
          </div>
          <div className="address-line">
            <span className="address-envelope">
              <Mail size={23} />
            </span>
            <input
              aria-label={t.address}
              readOnly
              value={inbox?.address || ""}
              placeholder={t.generating}
            />
            <button
              className="primary"
              aria-label={t.copy}
              disabled={!inbox || busy}
              onClick={() => copy(inbox!.address)}
            >
              <Copy size={17} />
              <span>{t.copy}</span>
            </button>
          </div>
          <div className="address-meta">
            <span className="countdown">
              <Clock size={14} />
              {t.expires} <strong>{inbox ? countdown : "—"}</strong>
              <button
                className="chip"
                disabled={!inbox || busy || !seconds}
                onClick={() =>
                  action(async () => {
                    const d = await api<{ expiresAt: string }>(
                      "inbox/extend",
                      "POST",
                    );
                    setInbox({ ...inbox!, expiresAt: d.expiresAt });
                    notify(t.extendSuccess);
                  })
                }
              >
                + {t.extend}
              </button>
            </span>
            <button
              className="chip"
              onClick={() => setModal("custom")}
              disabled={busy || !config}
            >
              <SlidersHorizontal size={14} />
              {t.custom}
              <ChevronDown size={12} />
            </button>
          </div>
          {needsCaptcha && captchaPlacement === "page" && (
            <div className="verify-panel">
              <span className="verify-label">
                <ShieldCheck size={14} />
                {t.verify}
              </span>
              <div className="captcha" ref={captchaEl} />
              {captcha && (
                <button
                  className="primary"
                  onClick={() => action(() => create())}
                >
                  {t.save}
                </button>
              )}
            </div>
          )}
          <div className="address-actions">
            <button
              className="ghost"
              disabled={busy || loading || (!inbox && needsCaptcha && !captcha)}
              onClick={() => (inbox ? setModal("new") : action(() => create()))}
            >
              <Plus size={17} />
              {t.new}
            </button>
            <button
              className="ghost"
              disabled={!inbox || busy}
              onClick={() => action(fetchMessages)}
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              {t.refresh}
            </button>
            <button
              className="ghost"
              disabled={!inbox || busy}
              onClick={() => setModal("delete")}
            >
              <Trash2 size={16} />
              {t.delete}
            </button>
            {sendingOn && (
              <button
                className="ghost"
                disabled={!inbox || busy || !seconds}
                onClick={() => {
                  setError("");
                  setModal("compose");
                }}
              >
                <Send size={16} />
                {t.send}
              </button>
            )}
            <button
              className="ghost"
              aria-label={t.qr}
              disabled={!inbox}
              onClick={() =>
                action(async () => {
                  setQr(
                    await QRCode.toDataURL(inbox!.address, {
                      width: 240,
                      margin: 2,
                    }),
                  );
                  setModal("qr");
                })
              }
            >
              <QrCode size={17} />
              <span>QR</span>
            </button>
          </div>
        </section>
        {process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && (
          <Script
            nonce={nonce}
            src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
            onReady={() => setTurnstileReady(true)}
          />
        )}
        <div className="under-address">
          <span>
            <ShieldCheck size={14} />
            {t.privateNote}
          </span>
          <div className="recover-save">
            <button className="secondary" onClick={() => setModal("restore")}>
              <KeyRound size={13} />
              {t.recoverAction}
            </button>
            {recovery && (
              <button className="secondary" onClick={() => setModal("recovery")}>
                <Download size={13} />
                {t.recovery}
              </button>
            )}
          </div>
        </div>
        {error && !modal && (
          <div className="error-notice" role="alert">
            <span>{error}</span>
            <button
              disabled={busy}
              onClick={() => action(inbox ? fetchMessages : init)}
            >
              {t.retry}
            </button>
            <button aria-label={t.close} onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section className="inbox-card">
          <div className="inbox-heading">
            <h2>
              <InboxIcon size={20} />
              {view === "sent" ? t.sentTitle : t.inbox}
              {view === "inbox" && <span className="count-pill">{unread}</span>}
            </h2>
            {sendingOn && (
              <div className="view-switch" role="tablist">
                <button
                  role="tab"
                  aria-selected={view === "inbox"}
                  onClick={() => {
                    setView("inbox");
                    setSelected(null);
                  }}
                >
                  {t.inbox}
                </button>
                <button
                  role="tab"
                  aria-selected={view === "sent"}
                  onClick={() => {
                    setView("sent");
                    setSelected(null);
                  }}
                >
                  {t.sent}
                </button>
              </div>
            )}
            <div className="inbox-toggles">
              <button
                className="icon-button"
                aria-label={t.sound}
                aria-pressed={sound}
                onClick={() => setSound(!sound)}
              >
                {sound ? <Volume2 size={17} /> : <VolumeX size={17} />}
              </button>
              <button
                className="icon-button"
                aria-label={t.notifications}
                onClick={() =>
                  action(async () => {
                    if ("Notification" in window) {
                      const permission = await Notification.requestPermission();
                      notify(
                        permission === "granted"
                          ? t.notifications + " ✓"
                          : t.notifications + " —",
                      );
                    }
                  })
                }
              >
                <Bell size={17} />
              </button>
            </div>
            <div className="inbox-status">
              <span
                className={live && seconds ? "status-dot" : "status-dot paused"}
              />
              {live && seconds ? t.live : t.offline}
            </div>
          </div>
          {view === "sent" ? (
            sentItems.length ? (
              <div className="message-list">
                {sentItems.map((m) => (
                  <div className="message-row sent-row" key={m.id}>
                    <span className="sender-avatar">
                      <Send size={15} />
                    </span>
                    <span className="message-summary">
                      <strong>
                        {m.to}
                        <span>{m.subject}</span>
                      </strong>
                      <small className={`sent-status ${m.status.toLowerCase()}`}>
                        {statusLabel(m.status)}
                      </small>
                    </span>
                    <time>
                      {new Date(m.createdAt).toLocaleString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-orbit">
                  <div className="empty-icon">
                    <Send size={32} strokeWidth={1.4} />
                  </div>
                </div>
                <h3>{t.sent}</h3>
                <p>{t.sentEmpty}</p>
                <button
                  className="primary"
                  disabled={!inbox || busy || !seconds}
                  onClick={() => setModal("compose")}
                >
                  <Send size={16} />
                  {t.send}
                </button>
              </div>
            )
          ) : selected ? (
            <div className="message-detail">
              <button              className="ghost"
              onClick={() => setSelected(null)}>
                <ArrowLeft size={16} />
                {t.back}
              </button>
              <h3>{selected.subject}</h3>
              <div className="message-sender">
                <span className="sender-avatar">
                  {(selected.senderName || selected.sender)[0].toUpperCase()}
                </span>
                <div>
                  <strong>{selected.senderName || selected.sender}</strong>
                  <p>{selected.sender}</p>
                  <p>To: {selected.recipient}</p>
                </div>
                <time>
                  {new Date(selected.receivedAt).toLocaleString(lang)}
                </time>
              </div>
              <div className="message-tools">
                <button
                  aria-pressed={!formatted}
                  onClick={() => setFormatted(false)}
                >
                  {t.plain}
                </button>
                <button
                  aria-pressed={formatted}
                  disabled={!selected.html}
                  onClick={() => setFormatted(true)}
                >
                  {t.html}
                </button>
                <button onClick={() => setModal("report")}>
                  <Flag size={14} />
                  {t.report}
                </button>
                <button
                  onClick={() =>
                    action(async () => {
                      await api(`messages/${selected.publicId}`, "DELETE");
                      setSelected(null);
                      await fetchMessages();
                    })
                  }
                >
                  <Trash2 size={14} />
                  {t.deleteMessage}
                </button>
              </div>
              {formatted ? (
                <>
                  <p className="remote-note">
                    {t.imagesWarning}{" "}
                    {!remote && (
                      <button
                        onClick={() =>
                          action(async () => {
                            setSelected(
                              await api<Message>(
                                `messages/${selected.publicId}?images=1`,
                              ),
                            );
                            setRemote(true);
                          })
                        }
                      >
                        {t.images}
                      </button>
                    )}
                  </p>
                  <iframe
                    title={selected.subject}
                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                    referrerPolicy="no-referrer"
                    srcDoc={`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${remote ? "https:" : "'none'"}; style-src 'unsafe-inline';"><style>body{font:16px/1.7 system-ui;color:#172524;overflow-wrap:anywhere}img{max-width:100%}a{color:#087c5c}</style></head><body>${selected.html}</body></html>`}
                  />
                </>
              ) : (
                <pre className="email-text">{selected.text || "—"}</pre>
              )}
              {selected.attachments.map((a) => (
                <div className="attachment" key={a.publicId}>
                  <span>
                    {a.name}
                    <small>
                      {a.mime} · {Math.ceil(a.size / 1024)} KB
                    </small>
                  </span>
                  <button
                    onClick={() =>
                      action(async () => {
                        const d = await api<{ url: string }>(
                          `attachments/${a.publicId}/ticket`,
                          "POST",
                        );
                        const link = document.createElement("a");
                        link.href = d.url;
                        link.download = a.name;
                        link.click();
                      })
                    }
                  >
                    <Download size={16} />
                    {t.download}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="inbox-toolbar">
                <label className="search">
                  <Search size={17} />
                  <input
                    aria-label={t.search}
                    placeholder={t.search}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label={t.newest}
                  value={order}
                  onChange={(e) => {
                    setOrder(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="newest">{t.newest}</option>
                  <option value="oldest">{t.oldest}</option>
                </select>
              </div>
              {loading ? (
                <div className="skeletons" aria-label={t.loading}>
                  {[1, 2, 3].map((n) => (
                    <div key={n} />
                  ))}
                </div>
              ) : messages.length ? (
                <div className="message-list">
                  {messages.map((m) => (
                    <button
                      className={`message-row ${m.readAt ? "" : "unread"}`}
                      key={m.publicId}
                      onClick={() => openMessage(m)}
                    >
                      <span className="sender-avatar">
                        {(m.senderName || m.sender)[0].toUpperCase()}
                      </span>
                      <span className="message-summary">
                        <strong>
                          {m.senderName || m.sender}
                          <span>{m.subject}</span>
                        </strong>
                        <small>{m.sender}</small>
                      </span>
                      <time>
                        {new Date(m.receivedAt).toLocaleTimeString(lang, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                      {!m.readAt && <span className="unread-dot" />}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-orbit">
                    <div className="empty-icon">
                      <InboxIcon size={35} strokeWidth={1.4} />
                    </div>
                    <span className="orbit-dot" />
                  </div>
                  <h3>{query ? t.noResults : t.waiting}</h3>
                  <p>{query ? t.emptySearch : t.empty}</p>
                  <span className="empty-hint">
                    <span className="pulse-dot" />
                    {t.noMessages}
                  </span>
                </div>
              )}
              <div className="inbox-bottom">
                <span>
                  <span className="subtle-dot" />
                  {total} {t.messages} · {unread} {t.unread}
                </span>
                <div>
                  {page > 1 && (
                    <button onClick={() => setPage(page - 1)}>
                      {t.previous}
                    </button>
                  )}
                  {page * 20 < total && (
                    <button onClick={() => setPage(page + 1)}>
                      {t.loadMore}
                    </button>
                  )}
                  <span>
                    <LockKeyhole size={12} />
                    {t.private}
                  </span>
                </div>
              </div>
            </>
          )}
        </section>
        {/* Primary placement: directly under the inbox card, so the tool
            (address + inbox) is fully finished above the first advert and no
            unit ever sits between individual messages. Renders nothing until
            an AdSense slot is configured for it. */}
        <AdPlacement
          placement="homepage primary"
          nonce={nonce}
          adsenseSlot={adsenseTopSlot}
          adsenseEnabled={adsenseEnabled}
        />
        {/* Adsterra banner: reinstated after the 2026-09-18 migration that
            removed the previous Adsterra integration. Occupies a position the
            other two networks do not claim; coexists with Monetag and AdSense
            rather than competing for a container. */}
        <AdsterraBanner
          placement="homepage below inbox card"
          nonce={nonce}
        />
        <p className="safety">
          <ShieldCheck size={16} />
          {t.safety}
        </p>
        <section className="benefits">
          <div className="section-kicker">{t.privacyTitle}</div>
          <div className="benefit-grid">
            {[
              [Zap, t.feature1, t.feature1text],
              [LockKeyhole, t.feature2, t.feature2text],
              [Clock, t.feature3, t.feature3text],
            ].map(([Icon, title, description], n) => {
              const I = Icon as typeof Zap;
              return (
                <article key={n}>
                  <span className="benefit-icon">
                    <I size={20} />
                  </span>
                  <h3>{title as string}</h3>
                  <p>{description as string}</p>
                </article>
              );
            })}
          </div>
        </section>
        {ads.map((a) => (
          <aside className="ad-slot" key={a.url}>
            <small>Sponsored</small>
            <a href={a.url} rel="sponsored noopener noreferrer" target="_blank">
              {a.label}
              <ArrowUpRight size={16} />
            </a>
          </aside>
        ))}
        <section className="how-strip">
          <div>
            <span className="eyebrow">{t.how}</span>
            <h2>{t.about}</h2>
            <Link href="/how-it-works" className="how-cta">
              {t.how} <ArrowRight size={16} />
            </Link>
          </div>
          <ol>
            {[t.step1, t.step2, t.step3].map((step, i) => (
              <li key={step}>
                <span>0{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>
        {/* Mid placement: between "how it works" and the SEO guide/FAQ, so the
            units are separated by real content rather than stacked. */}
        <AdPlacement
          placement="homepage mid"
          nonce={nonce}
          adsenseSlot={adsenseMidSlot}
          adsenseEnabled={adsenseEnabled}
        />
        {children}
        {/* Bottom placement: end of page, before the footer. Renders nothing
            without a slot id, so an unconfigured site never shows an empty box
            here. */}
        <AdPlacement
          placement="homepage footer"
          nonce={nonce}
          adsenseSlot={adsenseBottomSlot}
          adsenseEnabled={adsenseEnabled}
        />
      </main>
      <footer className="site-footer">
        <div>
          <Link href="/" className="brand">
            <Mail size={20} />
            {name}.
          </Link>
          <p>{t.footer}</p>
        </div>
        {/* Company and product links first: who runs the service and how to
            reach them is what a first-time visitor, a partner or a reviewer
            looks for, and burying it behind the policies is how a site ends up
            looking unattributable. */}
        <nav>
          <Link href="/about">{t.aboutPage}</Link>
          <Link href="/company">{t.companyPage}</Link>
          <Link href="/contact">{t.contactPage}</Link>
          <Link href="/ai-roadmap">{t.roadmapPage}</Link>
          <Link href="/blog">{t.journal}</Link>
          <Link href="/privacy">{t.privacy}</Link>
          <Link href="/terms">{t.terms}</Link>
          <Link href="/acceptable-use">{t.acceptable}</Link>
          {socialLinks.map((l) => (
            <a href={l.url} key={l.url} rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </nav>
        <span>
          © {new Date().getFullYear()} {name}
        </span>
      </footer>
      <div className="toast" role="status" aria-live="polite">
        {toast && (
          <span>
            <Check size={16} />
            {toast}
          </span>
        )}
      </div>
      <dialog
        aria-labelledby="modal-title"
        ref={dialog}
        onCancel={() => setModal(null)}
        onClick={(e) => {
          if (e.target === dialog.current) setModal(null);
        }}
      >
        <div className="modal-content">
          <button
            className="modal-close icon-button"
            aria-label={t.close}
            onClick={() => setModal(null)}
          >
            <X size={20} />
          </button>
          {modal === "custom" && (
            <>
              <h2 id="modal-title">{t.choose}</h2>
              <form
                onSubmit={(e) =>
                  form(e, async (d) => {
                    await create({
                      ...(d.get("username")
                        ? { username: String(d.get("username")) }
                        : {}),
                      domain: String(d.get("domain")),
                    });
                  })
                }
              >
                {config?.customUsernames && (
                  <label>
                    {t.username}
                    <input
                      name="username"
                      pattern="[A-Za-z0-9][A-Za-z0-9._\-]{2,31}"
                      title={t.usernameHint}
                      maxLength={32}
                      minLength={3}
                      placeholder="your-name"
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      inputMode="email"
                      onInput={(e) => {
                        // iOS auto-capitalises the first letter; normalise so the
                        // pattern check never fails on case or stray spaces.
                        const el = e.currentTarget;
                        el.value = el.value.toLowerCase().replace(/\s+/g, "");
                      }}
                    />
                    <small className="field-hint">{t.usernameHint}</small>
                  </label>
                )}
                <label>
                  {t.domain}
                  <select name="domain" required>
                    {config?.domains.map((d) => (
                      <option key={d.name}>{d.name}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy || (needsCaptcha && !captcha)}
                >
                  {t.save}
                  <ArrowRight size={16} />
                </button>
              </form>
            </>
          )}
          {modal === "restore" && (
            <>
              <h2 id="modal-title">{t.recover}</h2>
              <form
                onSubmit={(e) =>
                  form(e, async (d) => {
                    setInbox(
                      await api<InboxData>("restore", "POST", {
                        token: d.get("token"),
                      }),
                    );
                    setRecovery("");
                    setModal(null);
                  })
                }
              >
                <label>
                  {t.token}
                  <input
                    name="token"
                    type="password"
                    autoComplete="off"
                    required
                    minLength={43}
                    maxLength={43}
                  />
                </label>
                <button disabled={busy} className="primary">
                  {t.restore}
                </button>
              </form>
            </>
          )}
          {modal === "recovery" && (
            <>
              <h2 id="modal-title">{t.recovery}</h2>
              <p>{t.recoveryNote}</p>
              <code className="recovery-code">{recovery}</code>
              <button className="primary" onClick={() => copy(recovery)}>
                <Copy size={16} />
                {t.copy}
              </button>
            </>
          )}
          {modal === "qr" && (
            <>
              <h2 id="modal-title">{t.qr}</h2>
              {/* QR is locally generated and contains no access credentials. */}
              {qr && (
                <Image
                  unoptimized
                  className="qr-image"
                  src={qr}
                  width={240}
                  height={240}
                  alt={t.qr}
                />
              )}
              <p>{t.addressOnly}</p>
            </>
          )}
          {(modal === "delete" || modal === "new") && (
            <>
              <h2 id="modal-title">{modal === "delete" ? t.delete : t.new}</h2>
              <p>{modal === "delete" ? t.confirmDelete : t.confirmNew}</p>
              <div className="modal-actions">
                <button onClick={() => setModal(null)}>{t.cancel}</button>
                <button
                  className={modal === "delete" ? "danger" : "primary"}
                  disabled={busy || (modal === "new" && needsCaptcha && !captcha)}
                  onClick={() =>
                    action(async () => {
                      if (modal === "new") {
                        // Pass selected domain to distinguish deliberate replacement from idempotent initialization.
                        await create({ domain: inbox!.address.split("@")[1] });
                      } else {
                        await api("inbox", "DELETE");
                        setInbox(null);
                        setMessages([]);
                        setSelected(null);
                        setRecovery("");
                        setModal(null);
                        notify(t.deleted);
                      }
                    })
                  }
                >
                  {modal === "delete" ? t.deleteConfirm : t.confirm}
                </button>
              </div>
            </>
          )}
          {modal === "report" && (
            <>
              <h2 id="modal-title">{t.report}</h2>
              <form
                onSubmit={(e) =>
                  form(e, async (d) => {
                    await api(`messages/${selected!.publicId}/report`, "POST", {
                      reason: d.get("reason"),
                    });
                    setModal(null);
                    notify(t.reportSuccess);
                  })
                }
              >
                <label>
                  {t.reason}
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={1000}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {t.submit}
                </button>
              </form>
            </>
          )}
          {modal === "compose" && (
            <>
              <h2 id="modal-title">{t.compose}</h2>
              <p className="compose-from">
                <Mail size={14} />
                {inbox?.address}
              </p>
              <p>
                {config?.sending?.external ? t.composeNote : t.composeInternalOnly}
              </p>
              <form className="compose-form" onSubmit={(e) => form(e, send)}>
                <label>
                  {t.to}
                  <input
                    name="to"
                    type="email"
                    required
                    maxLength={254}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="email"
                    placeholder="name@example.com"
                    onInput={(e) => {
                      const el = e.currentTarget;
                      el.value = el.value.toLowerCase().replace(/\s+/g, "");
                    }}
                  />
                </label>
                <label>
                  {t.subject}
                  <input name="subject" maxLength={200} autoComplete="off" />
                </label>
                <label>
                  {t.message}
                  <textarea
                    name="text"
                    required
                    rows={7}
                    maxLength={sendMax}
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                  />
                  <small className="field-hint">
                    {composeText.length} / {sendMax} {t.characters}
                  </small>
                </label>
                <button
                  className="primary"
                  disabled={busy || !composeText.trim() || (needsCaptcha && !captcha)}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  {busy ? t.sending : t.sendAction}
                </button>
              </form>
            </>
          )}
          {needsCaptcha && captchaPlacement === "dialog" && (
            <div className="verify-panel">
              <span className="verify-label">
                <ShieldCheck size={14} />
                {t.verify}
              </span>
              <div className="captcha" ref={captchaEl} />
            </div>
          )}
          {error && modal && (
            <div className="error-notice" role="alert">{error}</div>
          )}
          {busy && <LoaderCircle size={18} className="spin" />}
        </div>
      </dialog>
    </>
  );
}
