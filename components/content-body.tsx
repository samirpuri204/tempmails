import { Fragment, type ReactNode } from "react";

// Intentionally limited Markdown: never render raw HTML from editorial/DB input.
export function safeContentHref(href: string): boolean {
  if (/[\u0000-\u0020\\]/.test(href)) return false;
  if (/^\/(?!\/)/.test(href) || /^#[a-zA-Z0-9_-]+$/.test(href)) return true;
  // Address-only mailto links, so policy pages can offer a one-click route to
  // the operator. Deliberately stricter than the URL parser: no query string,
  // no header parameters, no display name — just one address. `mailto:` cannot
  // execute script, and everything after the address is what would make it
  // interesting to an attacker, so nothing else is accepted.
  if (/^mailto:[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(href)) return true;
  try { const u = new URL(href); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; }
}
function inline(text: string): ReactNode[] {
  return text.split(/(\[[^\]\n]+\]\([^\s)]+\)|\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, i) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return safeContentHref(link[2]) ? <a key={i} href={link[2]} rel={link[2].startsWith("https:") ? "noopener noreferrer" : undefined}>{link[1]}</a> : <Fragment key={i}>{link[1]}</Fragment>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i}>{part.slice(1, -1)}</code>;
    return <Fragment key={i}>{part}</Fragment>;
  });
}
const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());

/**
 * An advert placed between blocks of an article.
 *
 * `at` is expressed relative to the article's own structure rather than a fixed
 * line number, so it keeps its intended position ("just after the opening
 * paragraph", "about halfway") as the copy is edited:
 *
 *   "intro"  — immediately after the opening block
 *   "middle" — after the block nearest the midpoint, always a distinct block
 *              from "intro" even in a very short article
 */
export type BodyAd = { at: "intro" | "middle"; node: ReactNode; key: string };

export function Body({ text, ads = [] }: { text: string; ads?: BodyAd[] }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    const key = i;
    if (/^#{1,3}\s/.test(line)) {
      const match = line.match(/^(#{1,3})\s+(.+)$/)!;
      // H1 belongs to the page shell. Embedded H1 is demoted.
      nodes.push(match[1].length === 3 ? <h3 key={key}>{inline(match[2])}</h3> : <h2 key={key}>{inline(match[2])}</h2>);
      i++; continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]);
      i++; nodes.push(<pre key={key}><code>{code.join("\n")}</code></pre>); continue;
    }
    if (line.includes("|") && i + 1 < lines.length && /^\|?\s*:?-{3,}/.test(lines[i + 1].trim())) {
      const head = cells(line); i += 2; const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) rows.push(cells(lines[i++]));
      nodes.push(<div className="content-table" key={key} tabIndex={0} role="region" aria-label="Comparison table"><table><thead><tr>{head.map((c,j) => <th scope="col" key={j}>{inline(c)}</th>)}</tr></thead><tbody>{rows.map((row,r) => <tr key={r}>{row.map((c,j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>); continue;
    }
    if (/^(?:[-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\d+\./.test(line); const rows: ReactNode[] = [];
      const pattern = ordered ? /^\d+\.\s/ : /^[-*]\s/;
      while (i < lines.length && pattern.test(lines[i].trim())) rows.push(<li key={i}>{inline(lines[i++].trim().replace(pattern, ""))}</li>);
      nodes.push(ordered ? <ol key={key}>{rows}</ol> : <ul key={key}>{rows}</ul>); continue;
    }
    if (line.startsWith("> ")) { nodes.push(<blockquote key={key}>{inline(line.slice(2))}</blockquote>); i++; continue; }
    const paragraph = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,3}\s|[-*]\s|\d+\.\s|```|> )/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
    nodes.push(<p key={key}>{inline(paragraph.join(" "))}</p>);
  }
  // Injected only when the article has enough structure to keep an advert away
  // from the opening lines: a two-block page gets no in-body unit at all rather
  // than one wedged into its first or last sentence.
  const intro = ads.filter((ad) => ad.at === "intro");
  const middle = ads.filter((ad) => ad.at === "middle");
  const showIntro = nodes.length >= 3 ? intro : [];
  const middleIndex = Math.max(1, Math.floor(nodes.length / 2));
  const showMiddle = nodes.length >= 4 ? middle : [];

  return (
    <div className="article-body">
      {nodes.map((node, index) => (
        <Fragment key={index}>
          {node}
          {index === 0 && showIntro.map((ad) => <Fragment key={ad.key}>{ad.node}</Fragment>)}
          {index === middleIndex && showMiddle.map((ad) => <Fragment key={ad.key}>{ad.node}</Fragment>)}
        </Fragment>
      ))}
    </div>
  );
}
