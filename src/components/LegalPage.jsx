// ── Shell for the public Privacy and Terms pages ─────────────────────
// Neither page checks for a signed-in user: Google and Apple fetch these
// URLs before they will let anyone sign in, and a visitor deciding whether
// to join should be able to read them first.
//
// `.page` is 1180px wide, which is unreadable for prose, and `.meta-dim`
// is an inline-flex row meant for one-line captions — so these pages get
// their own narrow column instead (see src/plan-nov12.css).
export function LegalPage({ title, updated, children }) {
  return (
    <div className="page legal-page">
      <header className="page-head legal-head">
        <h1>{title}</h1>
      </header>
      <p className="legal-updated">Last updated {updated}</p>
      <article className="legal-body">{children}</article>
    </div>
  )
}

export function Section({ title, children }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}
