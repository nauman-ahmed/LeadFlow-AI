import Script from 'next/script';

export default function HomePage() {
  return (
    <>
      <div className="landing-top">
        <div className="landing-top-inner">
          <a className="landing-brand" href="/">
            LeadFlow
          </a>
          <nav className="landing-nav" aria-label="Primary">
            <a href="/admin">Leads</a>
          </nav>
        </div>
      </div>

      <main>
        <div className="landing-hero">
          <h1>Capture every inbound conversation</h1>
          <p className="landing-lede">
            Web chat and phone inquiries land in one place. Your team sees transcripts, contact
            details, and status—without digging through inboxes or spreadsheets.
          </p>
          <dl className="landing-metrics">
            <div>
              <dt>Live demo</dt>
              <dd>Open the chat bubble ↘</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>Supabase + dashboard</dd>
            </div>
            <div>
              <dt>Stack</dt>
              <dd>Next.js widget + API</dd>
            </div>
          </dl>
        </div>

        <div className="landing-grid">
          <section className="card">
            <h2 className="landing-card-title">Try it</h2>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9375rem' }}>
              Use the widget in the corner as a visitor would. Each session creates a lead you can
              open in the{' '}
              <a href="/admin">leads view</a>.
            </p>
            <ul className="landing-list">
              <li>Answers come from the knowledge base and cite their source.</li>
              <li>Write in French (or switch the header to FR) and it answers in French.</li>
              <li>Ask to book an intro call to see real Cal.com slots.</li>
              <li>Each conversation shows up in the password-protected leads view.</li>
            </ul>
          </section>

          <section className="card" id="install">
            <h2 className="landing-card-title">Add to your site</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Replace the host with your deployed origin when you go live.
            </p>
            <pre className="landing-code">
              {`<script
  src="https://your-domain.example/leadflow-widget.js"
  data-tenant="demo"
  data-language="en"
  data-api="https://your-domain.example/api/chat"
  async
></script>`}
            </pre>
          </section>
        </div>

        <footer className="landing-foot">
          LeadFlow — inbound qualification prototype. Not affiliated with any CRM vendor.
        </footer>
      </main>

      <Script
        src="/leadflow-widget.js"
        strategy="afterInteractive"
        data-tenant="demo"
        data-language="en"
      />
    </>
  );
}
