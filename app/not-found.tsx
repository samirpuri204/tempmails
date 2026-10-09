import Link from "next/link";
export default function NotFound() {
  return (
    <main className="content-page">
      <span className="eyebrow">404</span>
      <h1>This page has moved on.</h1>
      <p>Your next temporary inbox is one click away.</p>
      <Link className="primary" href="/">
        Return to inbox
      </Link>
    </main>
  );
}
