import Script from 'next/script';

export default function HomePage() {
  return (
    <main className="container">
      <header style={{ marginBottom: 48 }}>
        <span className="badge" style={{ marginBottom: 12 }}>Sprint 1 demo</span>
        <h1 style={{ fontSize: '2.4rem', margin: '8px 0 12px' }}>LeadFlow AI</h1>
        <p className="muted" style={{ fontSize: '1.1rem', maxWidth: 640 }}>
          Inbound lead qualification across web chat and inbound phone. KB-grounded answers,
          calendar booking, CRM sync via webhook, human handoff, multi-language.
        </p>
      </header>

      <section className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Try the chatbot</h2>
        <p>
          Click the chat bubble in the bottom-right corner. Each new visitor creates a lead row in
          Supabase, which you can watch live in the{' '}
          <a href="/admin">mock CRM dashboard</a>.
        </p>
        <ul style={{ paddingLeft: 20 }}>
          <li>Replies are a deterministic stub today — AI lands in Sprint 2.</li>
          <li>Toggle the language to <code>FR</code> in the widget header to see French.</li>
          <li>Refresh <a href="/admin">/admin</a> after each message to see new rows.</li>
        </ul>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Embed snippet</h2>
        <p className="muted small">Drop this on any HTML page to load the widget:</p>
        <pre
          style={{
            background: '#0f172a',
            color: '#e2e8f0',
            padding: 16,
            borderRadius: 8,
            fontSize: '0.85rem',
            overflowX: 'auto'
          }}
        >
{`<script
  src="https://your-domain.example/leadflow-widget.js"
  data-tenant="demo"
  data-language="en"
  data-api="https://your-domain.example/api/chat"
  async
></script>`}
        </pre>
      </section>

      <Script
        src="/leadflow-widget.js"
        strategy="afterInteractive"
        data-tenant="demo"
        data-language="en"
      />
    </main>
  );
}
