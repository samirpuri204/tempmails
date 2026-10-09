"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="content-page">
      <h1>We couldn’t load this page.</h1>
      <p>
        Please try again in a moment. Your active inbox remains available
        through its secure browser cookie.
      </p>
      <button className="primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
