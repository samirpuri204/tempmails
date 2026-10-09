import { ImageResponse } from "next/og";
import { JOURNAL_NAME } from "./seo";

const frame = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "space-between" as const,
  width: "100%",
  height: "100%",
  padding: "70px",
  background: "#f0f7f2",
  color: "#173f2e",
  fontFamily: "sans-serif",
};

const footer = "Email privacy. Clear limits. Practical advice.";

/**
 * One branded template for every editorial social card: hub, guides and
 * journal articles share a single visual system instead of unrelated
 * generated pictures.
 */
export function editorialImage(title: string, category: string) {
  return new ImageResponse(<div style={frame}><div style={{ display: "flex", fontSize: 30 }}>TempMails · {category}</div><div style={{ display: "flex", fontSize: title.length > 85 ? 48 : 60, lineHeight: 1.15, fontWeight: 600 }}>{title.slice(0, 150)}</div><div style={{ display: "flex", fontSize: 26 }}>{footer}</div></div>, { width: 1200, height: 630 });
}

/** Card for the journal hub itself, which has no single article title. */
export function journalImage() {
  return new ImageResponse(<div style={frame}><div style={{ display: "flex", fontSize: 30 }}>TempMails · Journal</div><div style={{ display: "flex", flexDirection: "column", gap: 22 }}><div style={{ display: "flex", fontSize: 64, fontWeight: 600 }}>{JOURNAL_NAME}</div><div style={{ display: "flex", fontSize: 32 }}>Guides, provider changes and practical safety advice</div></div><div style={{ display: "flex", fontSize: 26 }}>{footer}</div></div>, { width: 1200, height: 630 });
}
