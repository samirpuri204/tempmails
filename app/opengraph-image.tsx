import { ImageResponse } from "next/og";
export const alt = "TempMails — Temporary email, lasting privacy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraph() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        padding: "90px",
        background: "#f0f7f2",
        color: "#173f2e",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ fontSize: 30, marginBottom: 60 }}>TempMails.</div>
      <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: -4 }}>
        A little privacy.
      </div>
      <div
        style={{
          fontSize: 76,
          fontWeight: 600,
          letterSpacing: -4,
          color: "#087d5c",
        }}
      >
        A lot less spam.
      </div>
      <div style={{ fontSize: 26, marginTop: 40, color: "#536c5e" }}>
        Private temporary email. No registration.
      </div>
    </div>,
    size,
  );
}
